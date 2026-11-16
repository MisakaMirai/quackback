import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IntlShape } from 'react-intl'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/solid'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { TimeAgo } from '@/components/ui/time-ago'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  listIntegrationSyncHistoryFn,
  inspectIntegrationSyncFn,
  recoverIntegrationSyncFn,
  verifyIntegrationSyncReferenceFn,
} from '@/lib/server/functions/integration-sync'
import {
  type SyncAction,
  type SyncFilter,
  type SyncHistoryItem,
  type SyncState,
} from '@/lib/shared/integration-sync'
import { toastError } from '@/lib/client/error-notice'

type Message = { id: string; defaultMessage: string }

const filterMessages: Array<[SyncFilter, Message]> = [
  ['all', { id: 'admin.integrations.sync.filterAll', defaultMessage: 'All' }],
  ['attention', { id: 'common.state.needsAttention', defaultMessage: 'Needs attention' }],
  ['progress', { id: 'admin.integrations.sync.filterProgress', defaultMessage: 'In progress' }],
  ['successful', { id: 'admin.integrations.sync.state.succeeded', defaultMessage: 'Successful' }],
]

const actionMessages: Record<SyncAction, Message> = {
  retry: { id: 'admin.integrations.sync.action.retry', defaultMessage: 'Try again' },
  cancel: { id: 'common.cancel', defaultMessage: 'Cancel' },
  reconcile: { id: 'admin.integrations.sync.action.reconcile', defaultMessage: 'Check result' },
  keep_remote: {
    id: 'admin.integrations.sync.action.keepRemote',
    defaultMessage: 'Dismiss change',
  },
  link_existing: {
    id: 'admin.integrations.sync.action.linkExisting',
    defaultMessage: 'Link existing item',
  },
}

const stateMessages: Record<SyncState, Message> = {
  queued: { id: 'admin.integrations.sync.state.queued', defaultMessage: 'Queued' },
  running: { id: 'admin.integrations.sync.state.running', defaultMessage: 'Syncing' },
  retry_wait: {
    id: 'admin.integrations.sync.state.retryWait',
    defaultMessage: 'Retry scheduled',
  },
  failed: { id: 'admin.integrations.sync.state.failed', defaultMessage: 'Failed' },
  auth_required: {
    id: 'admin.integrations.sync.state.authRequired',
    defaultMessage: 'Authentication required',
  },
  uncertain: { id: 'admin.integrations.sync.state.uncertain', defaultMessage: 'Outcome unknown' },
  conflict: { id: 'admin.integrations.sync.state.conflict', defaultMessage: 'Needs review' },
  succeeded: { id: 'admin.integrations.sync.state.succeeded', defaultMessage: 'Successful' },
  cancelled: { id: 'admin.integrations.sync.state.cancelled', defaultMessage: 'Cancelled' },
  superseded: { id: 'admin.integrations.sync.state.superseded', defaultMessage: 'Superseded' },
}

const kindMessages: Record<string, Message> = {
  create: { id: 'admin.integrations.sync.kind.create', defaultMessage: 'Create item' },
  refresh: { id: 'admin.integrations.sync.kind.refresh', defaultMessage: 'Update content' },
  status: { id: 'admin.integrations.sync.kind.status', defaultMessage: 'Update status' },
  'receive-status': {
    id: 'admin.integrations.sync.kind.receiveStatus',
    defaultMessage: 'Status received',
  },
  'receive-webhook': {
    id: 'admin.integrations.sync.kind.receiveWebhook',
    defaultMessage: 'Webhook received',
  },
  membership: {
    id: 'admin.integrations.sync.kind.membership',
    defaultMessage: 'Segment membership',
  },
  identify: { id: 'admin.integrations.sync.kind.identify', defaultMessage: 'Update user' },
  archive: { id: 'admin.integrations.sync.kind.archive', defaultMessage: 'Archive item' },
  'app-hook': { id: 'admin.integrations.sync.kind.appHook', defaultMessage: 'App event' },
  notify: { id: 'admin.integrations.sync.kind.notify', defaultMessage: 'Notification' },
  link: { id: 'admin.integrations.sync.action.linkExisting', defaultMessage: 'Link existing item' },
}

const attemptMessages: Record<string, Message> = {
  remote_succeeded: {
    id: 'admin.integrations.sync.attempt.remoteSucceeded',
    defaultMessage: 'Remote change confirmed',
  },
  manually_verified: {
    id: 'admin.integrations.sync.attempt.manuallyVerified',
    defaultMessage: 'Manually linked',
  },
  late_result: {
    id: 'admin.integrations.sync.attempt.lateResult',
    defaultMessage: 'Late result received',
  },
  interrupted: { id: 'admin.integrations.sync.attempt.interrupted', defaultMessage: 'Interrupted' },
}

const recordedAttemptMessage: Message = {
  id: 'admin.integrations.sync.attempt.recorded',
  defaultMessage: 'Recorded',
}

type Cursor = { at: string; id: string }

export function IntegrationSyncHistory({ provider }: { provider: string }) {
  const intl = useOptionalIntl()
  const [filter, setFilter] = useState<SyncFilter>('all')
  const [cursors, setCursors] = useState<Cursor[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const actionIds = useRef(new Map<string, string>())
  const history = useQuery({
    queryKey: ['integration-sync', provider, filter, cursors.at(-1)],
    queryFn: () =>
      listIntegrationSyncHistoryFn({ data: { provider, filter, cursor: cursors.at(-1) } }),
    refetchInterval: 10_000,
  })
  const action = useMutation({
    mutationFn: ({ item, kind }: { item: SyncHistoryItem; kind: SyncAction }) => {
      const key = `${item.id}:${item.version}:${kind}`
      const actionId = actionIds.current.get(key) ?? crypto.randomUUID()
      actionIds.current.set(key, actionId)
      return recoverIntegrationSyncFn({
        data: { id: item.id, version: item.version, action: kind, actionId },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['integration-sync'] })
      await queryClient.invalidateQueries({ queryKey: ['integration-sync-detail'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] })
    },
    onError: (error) => {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.integrations.sync.updateFailed',
          defaultMessage: 'Could not update this sync',
        })
      )
    },
  })
  if (history.data?.available === false) return null
  return (
    <section
      aria-label={intl.formatMessage({
        id: 'admin.integrations.sync.regionAria',
        defaultMessage: 'Sync history',
      })}
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex min-w-0 flex-1 flex-wrap gap-1"
          aria-label={intl.formatMessage({
            id: 'admin.integrations.sync.filterAria',
            defaultMessage: 'Filter sync history',
          })}
        >
          {filterMessages.map(([value, message]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'secondary' : 'ghost'}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value)
                setCursors([])
                setExpanded(null)
              }}
            >
              {intl.formatMessage(message)}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label={intl.formatMessage({
            id: 'admin.integrations.sync.refreshAria',
            defaultMessage: 'Refresh sync history',
          })}
          onClick={() => void history.refetch()}
          disabled={history.isFetching}
        >
          <ArrowPathIcon className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {intl.formatMessage({
          id: 'admin.integrations.sync.description',
          defaultMessage:
            'Activity from the last 90 days, plus unresolved syncs. Cancelling stops future attempts; it does not undo changes on the platform.',
        })}
      </p>
      {history.isPending ? (
        <div
          role="status"
          aria-label={intl.formatMessage({
            id: 'admin.integrations.sync.loadingAria',
            defaultMessage: 'Loading sync history',
          })}
          className="space-y-3"
        >
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <p role="alert" className="py-8 text-sm text-destructive">
          {intl.formatMessage({
            id: 'admin.integrations.sync.loadFailed',
            defaultMessage: 'Could not load sync history. Try refreshing.',
          })}
        </p>
      ) : !history.data.items.length ? (
        <EmptyState
          icon={ArrowPathIcon}
          title={intl.formatMessage({
            id: 'admin.integrations.sync.emptyTitle',
            defaultMessage: 'No syncs to show',
          })}
          description={
            filter === 'all'
              ? intl.formatMessage({
                  id: 'admin.integrations.sync.emptyDescription',
                  defaultMessage: 'New integration activity will appear here.',
                })
              : intl.formatMessage({
                  id: 'admin.integrations.sync.emptyFiltered',
                  defaultMessage: 'No syncs match this filter.',
                })
          }
          className="py-8"
        />
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden border-y border-t-transparent">
          {history.data.items.map((item) => (
            <div key={item.id}>
              <div className="flex flex-wrap items-start gap-3 p-4">
                <button
                  type="button"
                  disabled={!item.sourceTitle}
                  aria-expanded={item.sourceTitle ? expanded === item.id : undefined}
                  aria-controls={item.sourceTitle ? `sync-detail-${item.id}` : undefined}
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="min-w-0 basis-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-60 sm:flex-1"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {item.sourceTitle && (
                      <ChevronDownIcon
                        className={`h-4 w-4 shrink-0 transition-transform ${expanded === item.id ? 'rotate-180' : ''}`}
                      />
                    )}
                    <span className="truncate" title={item.sourceTitle ?? undefined}>
                      {item.sourceTitle ??
                        intl.formatMessage({
                          id: 'admin.integrations.sync.restrictedItem',
                          defaultMessage: 'Restricted or deleted item',
                        })}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.direction === 'outbound'
                      ? intl.formatMessage({
                          id: 'admin.integrations.sync.directionOutbound',
                          defaultMessage: 'To platform',
                        })
                      : intl.formatMessage({
                          id: 'admin.integrations.sync.directionInbound',
                          defaultMessage: 'From platform',
                        })}{' '}
                    ·{' '}
                    {kindMessages[item.kind]
                      ? intl.formatMessage(kindMessages[item.kind])
                      : intl.formatMessage({
                          id: 'admin.integrations.sync.kindFallback',
                          defaultMessage: 'Sync activity',
                        })}{' '}
                    · <TimeAgo date={item.updatedAt} />
                  </span>
                  {item.destinationLabel && (
                    <span
                      className="mt-1 block truncate text-xs text-muted-foreground"
                      title={item.destinationLabel}
                    >
                      {item.destinationLabel}
                    </span>
                  )}
                  {item.cancelRequested && ['running', 'uncertain'].includes(item.state) && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {intl.formatMessage({
                        id: 'admin.integrations.sync.cancelRequested',
                        defaultMessage: 'Further attempts stopped',
                      })}
                    </span>
                  )}
                </button>
                <Badge
                  variant={
                    ['failed', 'auth_required'].includes(item.state)
                      ? 'destructive'
                      : item.state === 'succeeded'
                        ? 'outline'
                        : 'secondary'
                  }
                >
                  {intl.formatMessage(stateMessages[item.state])}
                </Badge>
                <div className="flex flex-wrap gap-1">
                  {item.actions.map((kind) =>
                    kind === 'link_existing' ? (
                      <LinkExistingSyncItem key={kind} item={item} />
                    ) : (
                      <Button
                        key={kind}
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ item, kind })}
                      >
                        {kind === 'keep_remote' &&
                        item.direction === 'outbound' &&
                        item.kind !== 'create'
                          ? intl.formatMessage({
                              id: 'admin.integrations.sync.keepRemoteContent',
                              defaultMessage: 'Keep remote content',
                            })
                          : intl.formatMessage(actionMessages[kind])}
                      </Button>
                    )
                  )}
                </div>
              </div>
              {expanded === item.id && item.sourceTitle && <SyncDetail item={item} />}
            </div>
          ))}
        </div>
      )}
      {(cursors.length > 0 || history.data?.nextCursor) && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!cursors.length}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            {intl.formatMessage({
              id: 'admin.integrations.sync.previous',
              defaultMessage: 'Previous',
            })}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!history.data?.nextCursor}
            onClick={() => {
              if (history.data?.nextCursor) setCursors((c) => [...c, history.data.nextCursor!])
            }}
          >
            {intl.formatMessage({ id: 'admin.integrations.sync.next', defaultMessage: 'Next' })}
          </Button>
        </div>
      )}
    </section>
  )
}

function SyncDetail({ item }: { item: SyncHistoryItem }) {
  const intl = useOptionalIntl()
  const incomingStatus = item.direction === 'inbound' && item.kind === 'status'
  const detail = useQuery({
    queryKey: ['integration-sync-detail', item.id, item.version],
    queryFn: () => inspectIntegrationSyncFn({ data: { id: item.id } }),
  })
  return (
    <div
      id={`sync-detail-${item.id}`}
      className="space-y-3 border-t border-border/50 bg-muted/20 p-4 text-sm"
    >
      {item.error && <p role="status">{item.error}</p>}
      <div className="flex gap-4">
        {item.sourceId && (
          <a
            className="text-xs underline"
            href={
              item.sourceType === 'post'
                ? `/admin/feedback?post=${encodeURIComponent(item.sourceId)}`
                : `/admin/inbox?i=${encodeURIComponent(item.sourceId)}`
            }
          >
            {intl.formatMessage({
              id: 'admin.integrations.sync.viewSource',
              defaultMessage: 'View source',
            })}
          </a>
        )}
        {item.remoteUrl && (
          <a
            className="inline-flex items-center gap-1 text-xs underline"
            href={item.remoteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.remoteDisplayId ??
              intl.formatMessage({
                id: 'admin.integrations.sync.viewRemoteItem',
                defaultMessage: 'View remote item',
              })}
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        )}
      </div>
      {detail.isPending && (
        <Skeleton
          aria-label={intl.formatMessage({
            id: 'admin.integrations.sync.loadingDetails',
            defaultMessage: 'Loading sync details',
          })}
          className="h-16 w-full"
        />
      )}
      {detail.isError && (
        <p role="alert">
          {intl.formatMessage({
            id: 'admin.integrations.sync.detailsLoadFailed',
            defaultMessage: 'Could not load details.',
          })}
        </p>
      )}
      {detail.data?.remote && (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            {intl.formatMessage({
              id: 'admin.integrations.sync.currentRemoteContent',
              defaultMessage: 'Current remote content',
            })}
          </p>
          {detail.data.remote.externalUrl && (
            <a
              className="text-xs underline"
              href={detail.data.remote.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {intl.formatMessage({
                id: 'admin.integrations.sync.openOnPlatform',
                defaultMessage: 'Open on platform',
              })}
            </a>
          )}
          <Textarea
            aria-label={intl.formatMessage({
              id: 'admin.integrations.sync.currentRemoteContent',
              defaultMessage: 'Current remote content',
            })}
            readOnly
            value={`${detail.data.remote.title}\n\n${detail.data.remote.content}`}
            className="min-h-40"
          />
        </div>
      )}
      {detail.data?.preview && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {incomingStatus
              ? intl.formatMessage({
                  id: 'admin.integrations.sync.incomingStatusHint',
                  defaultMessage:
                    'Received status from the platform. Review the source item and update its status manually if appropriate.',
                })
              : intl.formatMessage({
                  id: 'admin.integrations.sync.proposedContentHint',
                  defaultMessage:
                    'Proposed content. Review the remote item and apply changes there to preserve its edits.',
                })}
          </p>
          <Textarea
            aria-label={
              incomingStatus
                ? intl.formatMessage({
                    id: 'admin.integrations.sync.receivedStatusAria',
                    defaultMessage: 'Received platform status',
                  })
                : intl.formatMessage({
                    id: 'admin.integrations.sync.proposedContentAria',
                    defaultMessage: 'Proposed sync content',
                  })
            }
            readOnly
            value={
              incomingStatus
                ? detail.data.preview.content
                : `${detail.data.preview.title}\n\n${detail.data.preview.content}`
            }
            className={incomingStatus ? 'min-h-16' : 'min-h-40'}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const preview = detail.data?.preview
              if (preview)
                void navigator.clipboard
                  .writeText(
                    incomingStatus ? preview.content : `${preview.title}\n\n${preview.content}`
                  )
                  .then(() =>
                    toast.success(
                      intl.formatMessage({
                        id: 'admin.integrations.sync.contentCopied',
                        defaultMessage: 'Content copied',
                      })
                    )
                  )
                  .catch(() =>
                    toast.error(
                      intl.formatMessage({
                        id: 'admin.integrations.sync.selectToCopy',
                        defaultMessage: 'Select the content to copy it',
                      })
                    )
                  )
            }}
          >
            {incomingStatus
              ? intl.formatMessage({
                  id: 'admin.integrations.sync.copyReceivedStatus',
                  defaultMessage: 'Copy received status',
                })
              : intl.formatMessage({
                  id: 'admin.integrations.sync.copyProposedContent',
                  defaultMessage: 'Copy proposed content',
                })}
          </Button>
        </div>
      )}
      {!!detail.data?.attempts.length && (
        <ol className="space-y-2 text-xs text-muted-foreground">
          {detail.data.attempts.map((attempt) => (
            <li key={attempt.id}>
              {intl.formatMessage(
                { id: 'admin.integrations.sync.attemptNumber', defaultMessage: 'Attempt {number}' },
                { number: attempt.number }
              )}{' '}
              · {attemptLabel(intl, attempt.state)} · <TimeAgo date={attempt.startedAt} />
              {attempt.error && <span className="block">{attempt.error}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function LinkExistingSyncItem({ item }: { item: SyncHistoryItem }) {
  const intl = useOptionalIntl()
  const [open, setOpen] = useState(false)
  const [reference, setReference] = useState('')
  const request = useRef<{ key: string; id: string } | null>(null)
  const queryClient = useQueryClient()
  const verify = useMutation({
    mutationFn: () => verifyIntegrationSyncReferenceFn({ data: { id: item.id, reference } }),
    onError: () =>
      toast.error(
        intl.formatMessage({
          id: 'admin.integrations.sync.verifyFailedToast',
          defaultMessage: 'Could not verify this item in the original destination.',
        })
      ),
  })
  const link = useMutation({
    mutationFn: () => {
      const key = `${item.id}:${item.version}:${reference}:${verify.data?.externalId}`
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
      return recoverIntegrationSyncFn({
        data: {
          id: item.id,
          version: item.version,
          actionId: request.current.id,
          action: 'link_existing',
          reference,
          expectedRemoteId: verify.data?.externalId,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['integration-sync'] })
      await queryClient.invalidateQueries({ queryKey: ['integration-sync-detail'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] })
      toast.success(
        intl.formatMessage({
          id: 'admin.integrations.sync.linkSuccess',
          defaultMessage: 'Remote item linked',
        })
      )
      setOpen(false)
    },
    onError: (error) =>
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.integrations.sync.linkFailed',
          defaultMessage: "Couldn't link the remote item",
        })
      ),
  })
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {intl.formatMessage(actionMessages.link_existing)}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!link.isPending) setOpen(value)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(actionMessages.link_existing)}</DialogTitle>
            <DialogDescription>
              {intl.formatMessage({
                id: 'admin.integrations.sync.linkDescription',
                defaultMessage:
                  'Find the item created by this sync. Verify its reference, then confirm the link to avoid creating another item.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor={`sync-reference-${item.id}`}>
              {intl.formatMessage({
                id: 'admin.integrations.sync.remoteReference',
                defaultMessage: 'Remote issue reference',
              })}
            </Label>
            <Input
              id={`sync-reference-${item.id}`}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value)
                verify.reset()
              }}
              disabled={verify.isPending || link.isPending}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!reference.trim() || verify.isPending || link.isPending}
              onClick={() => verify.mutate()}
            >
              {intl.formatMessage({
                id: 'admin.integrations.sync.verifyItem',
                defaultMessage: 'Verify item',
              })}
            </Button>
            {verify.data && (
              <div className="space-y-2">
                <p>
                  {verify.data.externalDisplayId}: {verify.data.title}
                </p>
                {verify.data.externalUrl && (
                  <a
                    href={verify.data.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                  >
                    {intl.formatMessage({
                      id: 'admin.integrations.sync.openOnPlatform',
                      defaultMessage: 'Open on platform',
                    })}
                  </a>
                )}
              </div>
            )}
            {verify.isError && (
              <p role="alert" className="text-sm text-destructive">
                {intl.formatMessage({
                  id: 'admin.integrations.sync.verifyFailed',
                  defaultMessage: 'Could not verify this item. Check the reference and try again.',
                })}
              </p>
            )}
            {link.isError && (
              <p role="alert" className="text-sm text-destructive">
                {link.error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={link.isPending} onClick={() => setOpen(false)}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button disabled={!verify.data || link.isPending} onClick={() => link.mutate()}>
              {link.isPending
                ? intl.formatMessage({
                    id: 'admin.integrations.sync.linking',
                    defaultMessage: 'Linking…',
                  })
                : intl.formatMessage({
                    id: 'admin.integrations.sync.confirmLink',
                    defaultMessage: 'Confirm link',
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function attemptLabel(intl: IntlShape, state: string): string {
  if (state in stateMessages) return intl.formatMessage(stateMessages[state as SyncState])
  return intl.formatMessage(attemptMessages[state] ?? recordedAttemptMessage)
}
