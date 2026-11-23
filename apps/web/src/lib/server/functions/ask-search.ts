import { ForbiddenError } from '@/lib/shared/errors'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth, policyActorFromAuth } from './auth-helpers'
import {
  MAX_SEARCH_DEPTH,
  MAX_SEARCH_LENGTH,
  SEARCH_KINDS,
  SEARCH_PAGE_SIZE,
} from '@/lib/shared/search'

/**
 * Workspace search for the dashboard palette and results page. Each kind
 * checks its own permission and row visibility for the effective actor.
 */
export const searchWorkspaceFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      query: z.string().trim().max(MAX_SEARCH_LENGTH),
      kind: z.enum(SEARCH_KINDS).optional(),
      offset: z.number().int().min(0).max(MAX_SEARCH_DEPTH).default(0),
      limit: z.number().int().min(1).max(50).default(SEARCH_PAGE_SIZE),
    })
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth()
    if (
      auth.scope !== 'dashboard' ||
      (auth.principal.role !== 'admin' && auth.principal.role !== 'member')
    ) {
      throw new ForbiddenError(
        'DASHBOARD_SESSION_REQUIRED',
        'Access denied: Requires a team dashboard session'
      )
    }
    const { searchWorkspace } = await import('@/lib/server/domains/search/workspace-search')
    const { getFeatureFlags } = await import('@/lib/server/domains/settings/settings.service')
    const [actor, flags] = await Promise.all([policyActorFromAuth(auth), getFeatureFlags()])
    return searchWorkspace(data.query, actor, flags, {
      kind: data.kind,
      offset: data.offset,
      limit: data.limit,
    })
  })
