import { NotFoundError, ValidationError } from '@/lib/shared/errors'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { BoardId, KbArticleId } from '@quackback/ids'
import {
  db,
  and,
  boards,
  eq,
  getSetupState,
  helpCenterArticles,
  isNull,
  sql,
} from '@/lib/server/db'
import { requireAuth } from './auth-helpers'
import { PERMISSIONS } from '@/lib/shared/permissions'
import {
  mutateSetupStateAtomic,
  acknowledgeActivationHandoff,
  applyDeferredLaunchStartingPoint,
} from '@/lib/server/setup-state'
import { isPathManaged } from '@/lib/server/config-file/managed-paths'
import { resolveFeatureFlags } from '@/lib/server/domains/settings/settings.types'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'activation' })

const markPublicBoardLinkCopiedSchema = z.object({ boardId: z.string().min(1) })

export const getStartingPointContextFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
  const row = await db.query.settings.findFirst()
  if (!row) throw new Error('Workspace is not set up yet')
  const { getSetupState } = await import('@/lib/shared/db-types')
  const state = getSetupState(row.setupState)
  const outcome = state?.useCase
  if (!outcome)
    throw new ValidationError('WORKSPACE_GOAL_REQUIRED', 'Choose a workspace goal first')
  const flags = resolveFeatureFlags(row.featureFlags)
  const slug = outcome === 'internal' ? 'team-feedback' : 'feedback'
  const preferredBoard = await db.query.boards.findFirst({
    where: and(eq(boards.slug, slug), isNull(boards.deletedAt)),
    columns: { id: true, name: true },
  })
  const existingBoard =
    preferredBoard ??
    (outcome === 'product_feedback' || outcome === 'internal'
      ? await db.query.boards.findFirst({
          where: and(
            isNull(boards.deletedAt),
            outcome === 'internal'
              ? sql`${boards.access}->>'view' = 'team'`
              : sql`coalesce(${boards.access}->>'view', 'anonymous') <> 'team'`
          ),
          columns: { id: true, name: true },
        })
      : null)
  const available =
    outcome === 'customer_support'
      ? flags.supportInbox
      : outcome === 'help_center'
        ? flags.helpCenter
        : true
  const blockedReason = available
    ? null
    : outcome === 'customer_support'
      ? 'Customer support is turned off for this workspace. Ask a workspace admin to enable it.'
      : 'Help Center is turned off for this workspace. Ask a workspace admin to enable it.'

  return {
    outcome,
    available,
    blockedReason,
    goalManaged: isPathManaged('workspace.useCase', row.managedFieldPaths),
    existingBoardName: existingBoard?.name ?? null,
    startingPoint: state?.steps.startingPoint ?? null,
  }
})

/** Resolve the exact artifact shown on the one-time setup handoff. */
export const getActivationBridgeContextFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
  let row = await db.query.settings.findFirst()
  if (!row) throw new Error('Workspace is not set up yet')
  let state = getSetupState(row.setupState)
  if (
    state?.useCase &&
    (!state.steps.startingPoint || state.steps.startingPoint.source === 'managed')
  ) {
    const { state: next } = await mutateSetupStateAtomic((current) => ({
      state: applyDeferredLaunchStartingPoint(current, current.useCase ?? state!.useCase!),
      value: undefined,
    }))
    state = next
    row = (await db.query.settings.findFirst()) ?? row
  }
  const startingPoint = state?.steps.startingPoint
  if (!startingPoint)
    throw new ValidationError('STARTING_POINT_REQUIRED', 'Choose a starting point first')

  let resourceLabel: string | null = null
  let starterBoard: { id: string; slug: string; publicPath: string } | null = null
  if (startingPoint.resourceType === 'board' && startingPoint.resourceId) {
    const board = await db.query.boards.findFirst({
      where: and(eq(boards.id, startingPoint.resourceId as BoardId), isNull(boards.deletedAt)),
      columns: { id: true, name: true, slug: true, access: true },
    })
    resourceLabel = board?.name ?? null
    if (board?.access.view === 'anonymous') {
      starterBoard = {
        id: board.id,
        slug: board.slug,
        publicPath: `/?board=${encodeURIComponent(board.slug)}`,
      }
    }
  } else if (startingPoint.resourceType === 'article' && startingPoint.resourceId) {
    const article = await db.query.helpCenterArticles.findFirst({
      where: and(
        eq(helpCenterArticles.id, startingPoint.resourceId as KbArticleId),
        isNull(helpCenterArticles.deletedAt)
      ),
      columns: { title: true },
    })
    resourceLabel = article?.title ?? null
  } else if (startingPoint.resourceType === 'messenger') {
    resourceLabel = `${row.name} Messenger`
  }

  return {
    workspaceName: row.name,
    workspaceSlug: row.slug,
    startingPoint,
    resourceLabel,
    starterBoard,
  }
})

/** Record the first intentional distribution of a publicly viewable board. */
export const markPublicBoardLinkCopiedFn = createServerFn({ method: 'POST' })
  .validator(markPublicBoardLinkCopiedSchema)
  .handler(async ({ data }) => {
    await requireAuth({ permission: PERMISSIONS.BOARD_MANAGE })
    const { state, value } = await mutateSetupStateAtomic(async (current, _row, tx) => {
      const board = await tx.query.boards.findFirst({
        where: and(eq(boards.id, data.boardId as BoardId), isNull(boards.deletedAt)),
        columns: { id: true, access: true },
      })
      if (!board) throw new NotFoundError('BOARD_NOT_FOUND', 'Board not found')
      if (board.access.view !== 'anonymous') {
        throw new ValidationError(
          'BOARD_NOT_PUBLIC',
          'Only a publicly viewable board link can be marked as shared'
        )
      }
      const copiedAt =
        current.activationMilestones?.publicBoardLinkCopiedAt ?? new Date().toISOString()
      return {
        state: {
          ...current,
          activationMilestones: {
            ...current.activationMilestones,
            publicBoardLinkCopiedAt: copiedAt,
          },
        },
        value: { boardId: board.id, copiedAt },
      }
    })
    log.info(
      { board_id: value.boardId, copied_at: state.activationMilestones?.publicBoardLinkCopiedAt },
      'public board link copied'
    )
    return value
  })

/** Record the first time an admin copied the status page link: the status goal's step. */
export const markStatusLinkCopiedFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
  const { value } = await mutateSetupStateAtomic(async (current) => {
    const copiedAt = current.activationMilestones?.statusLinkCopiedAt ?? new Date().toISOString()
    return {
      state: {
        ...current,
        activationMilestones: { ...current.activationMilestones, statusLinkCopiedAt: copiedAt },
      },
      value: { copiedAt },
    }
  })
  log.info({ copied_at: value.copiedAt }, 'status page link copied')
  return value
})

export const acknowledgeActivationHandoffFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
    const state = await acknowledgeActivationHandoff()
    return { activationHandoffSeenAt: state.activationHandoffSeenAt! }
  }
)
