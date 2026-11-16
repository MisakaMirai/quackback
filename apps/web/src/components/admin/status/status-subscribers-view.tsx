import { useRef, useState } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  UserMinusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { useFormatNumber } from '@/components/ui/format-number'
import { AnalyticsStatRow } from '@/components/admin/analytics/analytics-stat-row'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Spinner } from '@/components/shared/spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { AdminListHeader } from '@/components/admin/admin-list-header'
import { TimeAgo } from '@/components/ui/time-ago'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useInfiniteScroll } from '@/lib/client/hooks/use-infinite-scroll'
import { useDebouncedSearch } from '@/lib/client/hooks/use-debounced-search'
import { statusSubscriberQueries, type StatusSubscriptionAdmin } from '@/lib/client/queries/status'
import {
  useAddStatusSubscriber,
  useImportStatusSubscribers,
  useRemoveStatusSubscriber,
} from '@/lib/client/mutations/status'
import { exportStatusSubscribersAdminFn } from '@/lib/server/functions/status'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import type { IntlShape } from 'react-intl'
import { toastError } from '@/lib/client/error-notice'

/** Extract the "Email" column from a CSV file; falls back to treating every
 *  non-empty line as an email if no header row matches. (Kept local — the
 *  changelog import uses the same shape; a tiny parser isn't worth a shared
 *  cross-feature import.) */
function parseEmailsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const header = lines[0].split(',').map((cell) => cell.trim().toLowerCase())
  const emailColumn = header.indexOf('email')

  if (emailColumn === -1) {
    return lines.map((line) => line.split(',')[0]?.trim()).filter(Boolean)
  }

  return lines
    .slice(1)
    .map((line) => line.split(',')[emailColumn]?.trim())
    .filter((email): email is string => !!email)
}

/** RFC-4180 field escape (mirrors the audit-log export). */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type ExportRow = Awaited<ReturnType<typeof exportStatusSubscribersAdminFn>>[number]

function rowsToCsv(rows: ExportRow[]): string {
  const headers = [
    'name',
    'email',
    'scope',
    'services',
    'source',
    'subscribed_at',
    'unsubscribed_at',
  ]
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.displayName ?? '',
        r.email ?? '',
        r.scope,
        r.componentCount,
        r.source,
        r.createdAt,
        r.unsubscribedAt ?? '',
      ]
        .map(csvEscape)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

function downloadCsv(rows: ExportRow[]): void {
  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `status-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Only the non-default sources get a badge; a self-serve subscription is the normal case. */
const SOURCE_LABELS: Record<string, { id: string; defaultMessage: string }> = {
  auto: { id: 'admin.status.subscribers.sourceAuto', defaultMessage: 'Automatic' },
  admin: { id: 'admin.status.subscribers.sourceAdmin', defaultMessage: 'Added by admin' },
  csv_import: { id: 'admin.status.subscribers.csvImport', defaultMessage: 'CSV import' },
}

function subscriberName(intl: IntlShape, sub: StatusSubscriptionAdmin): string {
  return (
    sub.displayName ??
    sub.email ??
    intl.formatMessage({ id: 'admin.status.subscribers.unknown', defaultMessage: 'Unknown' })
  )
}

export function StatusSubscribersView() {
  const intl = useOptionalIntl()
  const formatNumber = useFormatNumber()
  const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>(undefined)
  const { value: searchValue, setValue: setSearchValue } = useDebouncedSearch({
    externalValue: debouncedSearch,
    onChange: setDebouncedSearch,
  })
  const [exporting, setExporting] = useState(false)
  const [removing, setRemoving] = useState<StatusSubscriptionAdmin | null>(null)
  const removeMutation = useRemoveStatusSubscriber()

  const countsQuery = useQuery(statusSubscriberQueries.counts())
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery(
    statusSubscriberQueries.list(debouncedSearch)
  )

  const loadMoreRef = useInfiniteScroll({
    hasMore: !!hasNextPage,
    isFetching: isLoading || isFetchingNextPage,
    onLoadMore: fetchNextPage,
    rootMargin: '0px',
    threshold: 0.1,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []

  async function confirmRemove() {
    if (!removing) return
    const name = subscriberName(intl, removing)
    try {
      const { removed } = await removeMutation.mutateAsync(removing.principalId)
      toast.success(
        removed
          ? intl.formatMessage(
              {
                id: 'admin.status.subscribers.removedToast',
                defaultMessage: 'Removed {name}.',
              },
              { name }
            )
          : intl.formatMessage(
              {
                id: 'admin.status.subscribers.alreadyUnsubscribed',
                defaultMessage: '{name} had already unsubscribed.',
              },
              { name }
            )
      )
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.subscribers.toastRemoveFailed',
          defaultMessage: 'Failed to remove subscriber',
        })
      )
    } finally {
      setRemoving(null)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const rows = await exportStatusSubscribersAdminFn()
      if (rows.length === 0) {
        toast.info(
          intl.formatMessage({
            id: 'admin.status.subscribers.toastNothingToExport',
            defaultMessage: 'No subscribers to export yet.',
          })
        )
        return
      }
      downloadCsv(rows)
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.subscribers.toastExportFailed',
          defaultMessage: 'Failed to export subscribers',
        })
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-5xl w-full flex flex-col flex-1 min-h-0">
      <AdminListHeader
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={intl.formatMessage({
          id: 'admin.status.subscribers.searchPlaceholder',
          defaultMessage: 'Search subscribers...',
        })}
        action={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              <ArrowUpTrayIcon className="h-4 w-4" />
              {exporting
                ? intl.formatMessage({
                    id: 'admin.status.action.exporting',
                    defaultMessage: 'Exporting…',
                  })
                : intl.formatMessage({
                    id: 'admin.status.subscribers.exportCsv',
                    defaultMessage: 'Export CSV',
                  })}
            </Button>
            <AddSubscribersDialog />
          </>
        }
      />

      <div className="p-3 space-y-3">
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <AnalyticsStatRow
            stats={[
              {
                label: intl.formatMessage({
                  id: 'admin.status.subscribers.statTotal',
                  defaultMessage: 'Total',
                }),
                value: formatNumber(countsQuery.data?.total ?? 0),
              },
              {
                label: intl.formatMessage({
                  id: 'admin.status.subscribers.statActive',
                  defaultMessage: 'Active',
                }),
                value: formatNumber(countsQuery.data?.active ?? 0),
              },
              {
                label: intl.formatMessage({
                  id: 'admin.status.subscribers.statUnsubscribed',
                  defaultMessage: 'Unsubscribed',
                }),
                value: formatNumber(countsQuery.data?.unsubscribed ?? 0),
              },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={
              searchValue
                ? intl.formatMessage({
                    id: 'admin.status.subscribers.emptySearch',
                    defaultMessage: 'No subscribers match your search',
                  })
                : intl.formatMessage({
                    id: 'admin.status.subscribers.emptyTitle',
                    defaultMessage: 'No subscribers yet',
                  })
            }
            className="h-48"
          />
        ) : (
          <div className="overflow-hidden border-y border-t-transparent border-border/50 divide-y divide-border/50">
            {items.map((sub) => (
              <div key={sub.id} className="group flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{subscriberName(intl, sub)}</div>
                  {sub.email && sub.displayName && (
                    <div className="text-xs text-muted-foreground truncate">{sub.email}</div>
                  )}
                </div>
                {sub.scope === 'components' && (
                  <Badge variant="outline" size="sm">
                    {intl.formatMessage(
                      {
                        id: 'admin.status.subscribers.serviceCount',
                        defaultMessage: '{count, plural, =1 {1 service} other {# services}}',
                      },
                      { count: sub.componentIds.length }
                    )}
                  </Badge>
                )}
                {SOURCE_LABELS[sub.source] && (
                  <Badge variant="outline" size="sm">
                    {intl.formatMessage(SOURCE_LABELS[sub.source])}
                  </Badge>
                )}
                <div className="text-xs text-muted-foreground text-right shrink-0 whitespace-nowrap">
                  {sub.unsubscribedAt ? (
                    <span>
                      {intl.formatMessage({
                        id: 'admin.status.subscribers.unsubscribed',
                        defaultMessage: 'Unsubscribed',
                      })}{' '}
                      <TimeAgo date={sub.unsubscribedAt} />
                    </span>
                  ) : (
                    <span>
                      {intl.formatMessage({
                        id: 'admin.status.subscribers.subscribed',
                        defaultMessage: 'Subscribed',
                      })}{' '}
                      <TimeAgo date={sub.createdAt} />
                    </span>
                  )}
                </div>
                {!sub.unsubscribedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    title={intl.formatMessage({
                      id: 'admin.status.subscribers.removeTitle',
                      defaultMessage: 'Remove subscriber',
                    })}
                    aria-label={intl.formatMessage(
                      {
                        id: 'admin.status.subscribers.removeAria',
                        defaultMessage: 'Remove {name}',
                      },
                      { name: subscriberName(intl, sub) }
                    )}
                    onClick={() => setRemoving(sub)}
                  >
                    <UserMinusIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={!!removing}
          onOpenChange={(o) => !o && setRemoving(null)}
          title={intl.formatMessage({
            id: 'admin.status.subscribers.removeConfirmTitle',
            defaultMessage: 'Remove subscriber?',
          })}
          description={
            removing
              ? intl.formatMessage(
                  {
                    id: 'admin.status.subscribers.removeConfirmDescription',
                    defaultMessage:
                      '{name} stops receiving status updates. They can subscribe again themselves.',
                  },
                  { name: subscriberName(intl, removing) }
                )
              : undefined
          }
          confirmLabel={intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' })}
          variant="destructive"
          isPending={removeMutation.isPending}
          onConfirm={confirmRemove}
        />

        {hasNextPage && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            {isFetchingNextPage ? (
              <Spinner />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                className="text-muted-foreground"
              >
                {intl.formatMessage({
                  id: 'admin.status.subscribers.loadMore',
                  defaultMessage: 'Load more',
                })}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AddSubscribersDialog() {
  const intl = useOptionalIntl()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogTrigger asChild>
        <NewButton noun="subscriber" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.status.subscribers.newTitle',
              defaultMessage: 'New subscriber',
            })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.status.subscribers.newDescription',
              defaultMessage:
                'Subscribe existing accounts to status updates. Emails without a matching account, and people who unsubscribed, are skipped; no new accounts are created.',
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="email">
          <TabsList>
            <TabsTrigger value="email">
              {intl.formatMessage({
                id: 'admin.status.subscribers.tabEmail',
                defaultMessage: 'By email',
              })}
            </TabsTrigger>
            <TabsTrigger value="csv">
              {intl.formatMessage({
                id: 'admin.status.subscribers.csvImport',
                defaultMessage: 'CSV import',
              })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="pt-1">
            <AddByEmailTab onDone={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="csv" className="pt-1">
            <CsvImportTab onDone={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function AddByEmailTab({ onDone }: { onDone: () => void }) {
  const intl = useOptionalIntl()
  const [email, setEmail] = useState('')
  const addMutation = useAddStatusSubscriber()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    try {
      const result = await addMutation.mutateAsync(trimmed)
      if (result.subscribed) {
        toast.success(
          intl.formatMessage(
            {
              id: 'admin.status.subscribers.subscribedToast',
              defaultMessage: 'Subscribed {email}.',
            },
            { email: trimmed }
          )
        )
      } else {
        toast.info(
          intl.formatMessage(
            {
              id: 'admin.status.subscribers.skippedUnsubscribed',
              defaultMessage: 'Skipped {email}: they unsubscribed from status updates.',
            },
            { email: trimmed }
          )
        )
      }
      setEmail('')
      onDone()
    } catch (error) {
      toastError(
        error,
        intl.formatMessage({
          id: 'admin.status.subscribers.toastNoMatchingUser',
          defaultMessage: 'No matching user for that email',
        })
      )
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="add-subscriber-email">
          {intl.formatMessage({
            id: 'admin.status.subscribers.emailLabel',
            defaultMessage: 'Email address',
          })}
        </Label>
        <Input
          id="add-subscriber-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.status.subscribers.emailHint',
            defaultMessage:
              'The email must belong to an existing account. This subscribes them to the whole page.',
          })}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={!email.trim() || addMutation.isPending}>
          {addMutation.isPending
            ? intl.formatMessage({
                id: 'admin.status.action.adding',
                defaultMessage: 'Adding…',
              })
            : intl.formatMessage({
                id: 'admin.status.subscribers.addAction',
                defaultMessage: 'Add subscriber',
              })}
        </Button>
      </DialogFooter>
    </form>
  )
}

function CsvImportTab({ onDone }: { onDone: () => void }) {
  const intl = useOptionalIntl()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [emails, setEmails] = useState<string[]>([])
  const [consentChecked, setConsentChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importMutation = useImportStatusSubscribers()

  function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseEmailsFromCsv(text)
      setEmails(parsed)
      if (parsed.length === 0) {
        setError(
          intl.formatMessage({
            id: 'admin.status.subscribers.csvNoEmails',
            defaultMessage: 'No emails found. Make sure the file has an "Email" column.',
          })
        )
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (emails.length === 0 || !consentChecked) return
    try {
      const result = await importMutation.mutateAsync(emails)
      toast.success(
        [
          intl.formatMessage(
            {
              id: 'admin.status.subscribers.importedToast',
              defaultMessage: 'Imported {count}.',
            },
            { count: result.imported }
          ),
          result.skipped > 0
            ? intl.formatMessage(
                {
                  id: 'admin.status.subscribers.importedSkippedNoAccount',
                  defaultMessage: 'Skipped {count} without a matching account.',
                },
                { count: result.skipped }
              )
            : null,
          result.optedOut > 0
            ? intl.formatMessage(
                {
                  id: 'admin.status.subscribers.importedSkippedUnsubscribed',
                  defaultMessage: 'Skipped {count} who unsubscribed.',
                },
                { count: result.optedOut }
              )
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      )
      onDone()
    } catch (err) {
      toastError(
        err,
        intl.formatMessage({
          id: 'admin.status.subscribers.importFailed',
          defaultMessage: 'Import failed',
        })
      )
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {fileName ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <DocumentTextIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground">
              {intl.formatMessage(
                {
                  id: 'admin.status.subscribers.emailsFound',
                  defaultMessage: '({count} emails found)',
                },
                { count: emails.length }
              )}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ArrowUpTrayIcon className="h-4 w-4" />
            {intl.formatMessage({
              id: 'admin.status.subscribers.csvChooseFile',
              defaultMessage: 'Click to choose a CSV file with an "Email" column',
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {emails.length > 0 && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={consentChecked}
            onCheckedChange={(checked) => setConsentChecked(checked === true)}
            className="mt-0.5"
            data-in-label
          />
          <span>
            {intl.formatMessage({
              id: 'admin.status.subscribers.csvConsent',
              defaultMessage:
                'I confirm every person on this list has agreed to receive email from us, and I am not importing a purchased or scraped list.',
            })}
          </span>
        </label>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={emails.length === 0 || !consentChecked || importMutation.isPending}
        >
          {importMutation.isPending
            ? intl.formatMessage({
                id: 'admin.status.action.importing',
                defaultMessage: 'Importing…',
              })
            : intl.formatMessage(
                {
                  id: 'admin.status.subscribers.subscribeCount',
                  defaultMessage: 'Subscribe {count} emails',
                },
                { count: emails.length }
              )}
        </Button>
      </DialogFooter>
    </div>
  )
}
