import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PostId } from '@quackback/ids'
import type { ActivityType } from '@/lib/shared/types'
import { activityQueries } from '@/lib/client/queries/activity'
import { useUnmergePost } from '@/lib/client/mutations/post-merge'
import { CompactPostCard } from '@/components/shared/compact-post-card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeAgo } from '@/components/ui/time-ago'
import {
  PlusIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  UserIcon,
  TagIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChatBubbleLeftIcon,
  HandThumbUpIcon,
  FolderIcon,
  LinkIcon,
} from '@heroicons/react/16/solid'
import { IconGitMerge } from '@tabler/icons-react'
import type { IntlShape } from 'react-intl'
import { SOURCE_TYPE_LABELS } from '@/components/admin/feedback/source-type-icon'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { getLatestMergeStateByDuplicateId } from './post-activity-timeline.utils'
import { toastError } from '@/lib/client/error-notice'

// ============================================
// Types
// ============================================

interface ActivityItem {
  id: string
  postId: string
  principalId: string | null
  type: string
  metadata: Record<string, unknown>
  createdAt: string
  actorName: string | null
}

// ============================================
// Activity type display config
// ============================================

interface ActivityDisplayConfig {
  icon: React.ComponentType<{ className?: string }>
  label: (intl: IntlShape, metadata: Record<string, unknown>, actorName: string | null) => string
  detail?: (intl: IntlShape, metadata: Record<string, unknown>) => React.ReactNode
}

const actorLabel = (intl: IntlShape, name: string | null) =>
  name ?? intl.formatMessage({ id: 'admin.ticketActivity.system', defaultMessage: 'System' })

const SUGGESTION_TYPE_LABELS: Record<string, { id: string; defaultMessage: string }> = {
  create_post: { id: 'admin.feedback.activity.suggestionCreate', defaultMessage: 'create' },
  vote_on_post: { id: 'admin.feedback.activity.suggestionVote', defaultMessage: 'vote' },
  duplicate_post: { id: 'admin.feedback.activity.suggestionMerge', defaultMessage: 'merge' },
}

const ACTIVITY_CONFIG: Partial<Record<ActivityType, ActivityDisplayConfig>> = {
  'post.created': {
    icon: PlusIcon,
    label: (intl, m, a) =>
      m.source === 'feedback_suggestion'
        ? intl.formatMessage(
            {
              id: 'admin.feedback.activity.createdFromSuggestion',
              defaultMessage: '{actor} created this post from feedback',
            },
            { actor: actorLabel(intl, a) }
          )
        : intl.formatMessage(
            {
              id: 'admin.feedback.activity.created',
              defaultMessage: '{actor} created this post',
            },
            { actor: actorLabel(intl, a) }
          ),
    detail: (intl, m) => {
      if (m.source === 'feedback_suggestion') {
        const suggestionType = SUGGESTION_TYPE_LABELS[m.suggestionType as string]
        const typeLabel = suggestionType
          ? intl.formatMessage(suggestionType)
          : (m.suggestionType as string)
        return m.suggestionType ? (
          <span className="text-xs text-muted-foreground">
            {intl.formatMessage(
              {
                id: 'admin.feedback.activity.viaSuggestion',
                defaultMessage: 'via {type} suggestion',
              },
              { type: typeLabel }
            )}
          </span>
        ) : null
      }
      return m.boardName
        ? intl.formatMessage(
            { id: 'admin.feedback.activity.inBoard', defaultMessage: 'in {board}' },
            { board: m.boardName as string }
          )
        : undefined
    },
  },
  'vote.proxy': {
    icon: HandThumbUpIcon,
    label: (intl, m, a) => {
      const voter = m.voterName as string | undefined
      return voter
        ? intl.formatMessage(
            {
              id: 'admin.feedback.activity.votedOnBehalf',
              defaultMessage: '{actor} voted on behalf of {voter}',
            },
            { actor: actorLabel(intl, a), voter }
          )
        : intl.formatMessage(
            {
              id: 'admin.feedback.activity.proxyVote',
              defaultMessage: '{actor} added a proxy vote',
            },
            { actor: actorLabel(intl, a) }
          )
    },
    detail: (intl, m) => {
      const st = m.sourceType as string | undefined
      return st ? (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(
            { id: 'admin.feedback.activity.viaSource', defaultMessage: 'via {source}' },
            { source: SOURCE_TYPE_LABELS[st] ?? st }
          )}
        </span>
      ) : null
    },
  },
  'vote.removed': {
    icon: HandThumbUpIcon,
    label: (intl, m, a) => {
      const voter = m.voterName as string | undefined
      return voter
        ? intl.formatMessage(
            {
              id: 'admin.feedback.activity.removedVote',
              defaultMessage: "{actor} removed {voter}'s vote",
            },
            { actor: actorLabel(intl, a), voter }
          )
        : intl.formatMessage(
            {
              id: 'admin.feedback.activity.removedVoteAnonymous',
              defaultMessage: '{actor} removed a vote',
            },
            { actor: actorLabel(intl, a) }
          )
    },
  },
  'post.deleted': {
    icon: TrashIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.deleted',
          defaultMessage: '{actor} deleted this post',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'post.restored': {
    icon: ArrowUturnLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.restored',
          defaultMessage: '{actor} restored this post',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'external.status_changed': {
    icon: LinkIcon,
    label: (intl, m) => {
      const reference =
        (m.externalDisplayId as string | undefined) ??
        intl.formatMessage({
          id: 'admin.feedback.activity.externalReference',
          defaultMessage: 'A linked issue',
        })
      const transition = m.transition as string | undefined
      if (transition === 'closed') {
        return intl.formatMessage(
          {
            id: 'admin.feedback.activity.externalClosed',
            defaultMessage: '{reference} was closed',
          },
          { reference }
        )
      }
      if (transition === 'reopened') {
        return intl.formatMessage(
          {
            id: 'admin.feedback.activity.externalReopened',
            defaultMessage: '{reference} was reopened',
          },
          { reference }
        )
      }
      const status =
        (m.externalStatus as string | undefined) ??
        intl.formatMessage({
          id: 'admin.feedback.activity.externalStatus',
          defaultMessage: 'a new status',
        })
      return intl.formatMessage(
        {
          id: 'admin.feedback.activity.externalMoved',
          defaultMessage: '{reference} moved to “{status}”',
        },
        { reference, status }
      )
    },
    detail: (intl, m) => {
      const url = m.externalUrl as string | undefined
      if (!url) return null
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          {intl.formatMessage({
            id: 'admin.feedback.activity.viewIssue',
            defaultMessage: 'View issue',
          })}
        </a>
      )
    },
  },
  'status.changed': {
    icon: ChatBubbleLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.statusChanged',
          defaultMessage: '{actor} changed status',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (_, m) => {
      const from = m.fromName as string | undefined
      const to = m.toName as string | undefined
      if (!from && !to) return null
      return (
        <span className="text-xs text-muted-foreground">
          {from && (
            <span
              className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium mr-1"
              style={{
                backgroundColor: `${(m.fromColor as string) ?? '#888'}20`,
                color: (m.fromColor as string) ?? '#888',
              }}
            >
              {from}
            </span>
          )}
          <span className="mx-0.5">&rarr;</span>
          {to && (
            <span
              className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ml-1"
              style={{
                backgroundColor: `${(m.toColor as string) ?? '#888'}20`,
                color: (m.toColor as string) ?? '#888',
              }}
            >
              {to}
            </span>
          )}
        </span>
      )
    },
  },
  'post.board_changed': {
    icon: FolderIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.boardChanged',
          defaultMessage: '{actor} moved to a different board',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (intl, m) => {
      const from = m.fromBoardName as string | undefined
      const to = m.toBoardName as string | undefined
      if (!from && !to) return null
      return (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(
            { id: 'admin.ticketActivity.fromTo', defaultMessage: '{from} → {to}' },
            { from: from ?? '', to: to ?? '' }
          )}
        </span>
      )
    },
  },
  'post.merged_in': {
    icon: IconGitMerge,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.mergedIn',
          defaultMessage: '{actor} merged in a post',
        },
        { actor: actorLabel(intl, a) }
      ),
    // Detail rendered by MergedInCard below (not the standard detail function)
  },
  'post.merged_away': {
    icon: IconGitMerge,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.mergedAway',
          defaultMessage: '{actor} merged this into another post',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (_, m) => (
      <span className="text-xs text-muted-foreground truncate">
        {m.canonicalPostTitle as string}
      </span>
    ),
  },
  'post.unmerged': {
    icon: ArrowUturnLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.unmergedPost',
          defaultMessage: '{actor} unmerged a post',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (_, m) => (
      <span className="text-xs text-muted-foreground truncate">{m.otherPostTitle as string}</span>
    ),
  },
  'owner.assigned': {
    icon: UserIcon,
    label: (intl, m, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.assigned',
          defaultMessage: '{actor} assigned {name}',
        },
        {
          actor: actorLabel(intl, a),
          name:
            (m.ownerName as string) ??
            intl.formatMessage({
              id: 'admin.feedback.activity.someone',
              defaultMessage: 'someone',
            }),
        }
      ),
    detail: (intl, m) =>
      m.previousOwnerName ? (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(
            { id: 'admin.ticketActivity.previously', defaultMessage: 'Previously: {name}' },
            { name: m.previousOwnerName as string }
          )}
        </span>
      ) : null,
  },
  'owner.unassigned': {
    icon: UserIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.unassigned',
          defaultMessage: '{actor} removed assignee',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (intl, m) =>
      m.previousOwnerName ? (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(
            { id: 'admin.ticketActivity.previously', defaultMessage: 'Previously: {name}' },
            { name: m.previousOwnerName as string }
          )}
        </span>
      ) : null,
  },
  'tags.added': {
    icon: TagIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.tagsAdded',
          defaultMessage: '{actor} added tags',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (_, m) => {
      const names = m.tagNames as string[] | undefined
      if (!names?.length) return null
      return (
        <span className="flex flex-wrap gap-1">
          {names.map((name) => (
            <span
              key={name}
              className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </span>
      )
    },
  },
  'tags.removed': {
    icon: TagIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.tagsRemoved',
          defaultMessage: '{actor} removed tags',
        },
        { actor: actorLabel(intl, a) }
      ),
    detail: (_, m) => {
      const names = m.tagNames as string[] | undefined
      if (!names?.length) return null
      return (
        <span className="flex flex-wrap gap-1">
          {names.map((name) => (
            <span
              key={name}
              className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground line-through"
            >
              {name}
            </span>
          ))}
        </span>
      )
    },
  },
  'comments.locked': {
    icon: LockClosedIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentsLocked',
          defaultMessage: '{actor} locked comments',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comments.unlocked': {
    icon: LockOpenIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentsUnlocked',
          defaultMessage: '{actor} unlocked comments',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comment.pinned': {
    icon: ChatBubbleLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentPinned',
          defaultMessage: '{actor} pinned a response',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comment.unpinned': {
    icon: ChatBubbleLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentUnpinned',
          defaultMessage: '{actor} unpinned the response',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comment.deleted': {
    icon: TrashIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentDeleted',
          defaultMessage: '{actor} deleted their comment',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comment.removed': {
    icon: TrashIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentRemoved',
          defaultMessage: '{actor} removed a comment',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
  'comment.restored': {
    icon: ArrowUturnLeftIcon,
    label: (intl, _, a) =>
      intl.formatMessage(
        {
          id: 'admin.feedback.activity.commentRestored',
          defaultMessage: '{actor} restored a comment',
        },
        { actor: actorLabel(intl, a) }
      ),
  },
}

// ============================================
// Merged-in inline card (with unmerge action)
// ============================================

function MergedInCard({ activity, isUnmerged }: { activity: ActivityItem; isUnmerged: boolean }) {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const unmerge = useUnmergePost()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const duplicatePostId = activity.metadata.duplicatePostId as string | undefined
  const title =
    (activity.metadata.duplicatePostTitle as string) ||
    intl.formatMessage({ id: 'ask.results.untitled', defaultMessage: 'Untitled' })
  const voteCount = (activity.metadata.duplicateVoteCount as number) ?? 0
  const authorName = activity.metadata.duplicateAuthorName as string | null

  const handleUnmerge = async () => {
    if (!duplicatePostId) return
    try {
      await unmerge.mutateAsync(duplicatePostId as PostId)
      queryClient.invalidateQueries({ queryKey: ['activity', 'post'] })
      toast.success(
        intl.formatMessage({
          id: 'admin.feedback.merge.unmerged',
          defaultMessage: 'Post unmerged successfully',
        })
      )
    } catch (err) {
      toastError(
        err,
        intl.formatMessage({
          id: 'admin.feedback.merge.unmergeFailed',
          defaultMessage: 'Failed to unmerge post',
        })
      )
    } finally {
      setConfirmOpen(false)
    }
  }

  const unmergeAction =
    duplicatePostId && !isUnmerged ? (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={unmerge.isPending}
        className="text-xs shrink-0"
      >
        {intl.formatMessage({
          id: 'admin.feedback.merge.unmerge',
          defaultMessage: 'Unmerge',
        })}
      </Button>
    ) : undefined

  return (
    <>
      <CompactPostCard
        title={title}
        voteCount={voteCount}
        authorName={authorName}
        actions={unmergeAction}
        className="mt-1.5"
      />

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage({
                id: 'admin.feedback.merge.unmergeTitle',
                defaultMessage: 'Unmerge this post?',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{title}</span>{' '}
              {intl.formatMessage({
                id: 'admin.feedback.merge.unmergeDescription',
                defaultMessage:
                  'will be restored as independent feedback. Its votes will no longer count toward this post.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unmerge.isPending}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleUnmerge} disabled={unmerge.isPending}>
              {unmerge.isPending
                ? intl.formatMessage({
                    id: 'admin.feedback.merge.unmerging',
                    defaultMessage: 'Unmerging...',
                  })
                : intl.formatMessage({
                    id: 'admin.feedback.merge.unmerge',
                    defaultMessage: 'Unmerge',
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================
// Component
// ============================================

function ActivityEntry({
  activity,
  mergeStateByDuplicateId,
}: {
  activity: ActivityItem
  mergeStateByDuplicateId: Map<string, boolean>
}) {
  const intl = useOptionalIntl()
  const config = ACTIVITY_CONFIG[activity.type as ActivityType]
  if (!config) return null

  const Icon = config.icon
  const label = config.label(intl, activity.metadata, activity.actorName)
  const detail =
    activity.type === 'post.merged_in' ? null : config.detail?.(intl, activity.metadata)
  const duplicatePostId = activity.metadata.duplicatePostId as string | undefined

  const isUnmerged =
    activity.type === 'post.merged_in' && !!duplicatePostId
      ? mergeStateByDuplicateId.get(duplicatePostId) === true
      : false

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-foreground">{label}</p>
          <TimeAgo date={activity.createdAt} className="shrink-0 text-xs text-muted-foreground" />
        </div>
        {detail && <div className="mt-0.5">{detail}</div>}
        {activity.type === 'post.merged_in' && (
          <MergedInCard activity={activity} isUnmerged={isUnmerged} />
        )}
      </div>
    </div>
  )
}

export function PostActivityTimeline({ postId }: { postId: PostId }) {
  const intl = useOptionalIntl()
  const { data, isLoading } = useQuery(activityQueries.forPost(postId))
  const activities = data as unknown as ActivityItem[] | undefined
  const mergeStateByDuplicateId = getLatestMergeStateByDuplicateId(activities ?? [])

  if (isLoading) {
    return (
      <div className="space-y-3 px-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!activities?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.ticketActivity.empty',
            defaultMessage: 'No activity recorded yet',
          })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.feedback.activity.emptyDescription',
            defaultMessage: 'Activity will appear here as changes are made to this post',
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border px-6">
      {activities.map((activity) => (
        <ActivityEntry
          key={activity.id}
          activity={activity}
          mergeStateByDuplicateId={mergeStateByDuplicateId}
        />
      ))}
    </div>
  )
}
