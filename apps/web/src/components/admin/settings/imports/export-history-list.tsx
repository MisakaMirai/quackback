import { useQuery } from '@tanstack/react-query'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { TimeAgo } from '@/components/ui/time-ago'
import {
  formatNumberIn,
  useFormatNumber,
  type NumberFormatter,
} from '@/components/ui/format-number'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'
import { ArchiveBoxIcon } from '@heroicons/react/24/solid'
import { settingsQueries } from '@/lib/client/queries/settings'
import type { ExportRunListItem } from '@/lib/server/functions/data-runs'
import type { IntlShape } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

const IN_FLIGHT_STATUSES = new Set<ExportRunListItem['status']>(['pending', 'running'])

const STATUS_LABEL: Record<ExportRunListItem['status'], { id: string; defaultMessage: string }> = {
  pending: { id: 'admin.settings.imports.status.queued', defaultMessage: 'Queued' },
  running: { id: 'admin.settings.imports.status.exporting', defaultMessage: 'Exporting' },
  completed: { id: 'portal.status.lifecycle.completed', defaultMessage: 'Completed' },
  failed: { id: 'admin.settings.imports.status.failed', defaultMessage: 'Failed' },
}

const STATUS_VARIANT: Record<
  ExportRunListItem['status'],
  'secondary' | 'default' | 'destructive' | 'success'
> = {
  pending: 'secondary',
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "1,204 posts · 5,632 votes · 86 tags +4 more" */
export function summarizeEntityCounts(
  counts: Record<string, number>,
  formatNumber: NumberFormatter = (n) => formatNumberIn(DEFAULT_LOCALE, n),
  intl?: IntlShape
): string {
  const entries = Object.entries(counts)
  if (entries.length === 0) return '-'
  const shown = entries
    .slice(0, 3)
    .map(([key, count]) => `${formatNumber(count)} ${key.replace(/_/g, ' ')}`)
  const rest = entries.length - shown.length
  if (rest <= 0) return shown.join(' · ')
  const more = intl
    ? intl.formatMessage(
        { id: 'admin.settings.imports.exportHistory.more', defaultMessage: '+{count} more' },
        { count: rest }
      )
    : `+${rest} more`
  return `${shown.join(' · ')} ${more}`
}

function isExpired(run: ExportRunListItem): boolean {
  return run.expiresAt != null && new Date(run.expiresAt).getTime() < Date.now()
}

export function ExportHistoryList() {
  const intl = useOptionalIntl()
  const formatNumber = useFormatNumber()
  const { data: runs, isLoading } = useQuery({
    ...settingsQueries.exportRuns(),
    refetchInterval: (query) => {
      const rows = query.state.data
      return rows?.some((r) => IN_FLIGHT_STATUSES.has(r.status)) ? 2000 : false
    },
  })

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({
          id: 'admin.settings.imports.exportHistory.loading',
          defaultMessage: 'Loading export history...',
        })}
      </p>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <EmptyState
        icon={ArchiveBoxIcon}
        title={intl.formatMessage({
          id: 'admin.settings.imports.exportHistory.emptyTitle',
          defaultMessage: 'No exports yet',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.imports.exportHistory.emptyDescription',
          defaultMessage: 'Workspace exports you start above show up here with a download link.',
        })}
        className="py-8"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.settings.imports.started',
                defaultMessage: 'Started',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'files.archive.columnSize',
                defaultMessage: 'Size',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.settings.imports.exportHistory.contents',
                defaultMessage: 'Contents',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.changelog.filters.status',
                defaultMessage: 'Status',
              })}
            </TableHead>
            <TableHead className="text-right">
              {intl.formatMessage({ id: 'files.download', defaultMessage: 'Download' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="text-sm text-muted-foreground">
                <TimeAgo date={run.createdAt} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {run.sizeBytes != null ? formatBytes(run.sizeBytes) : '-'}
              </TableCell>
              <TableCell
                className="max-w-[260px] truncate text-sm text-muted-foreground"
                title={
                  run.error ??
                  (run.entityCounts
                    ? summarizeEntityCounts(run.entityCounts, formatNumber, intl)
                    : '')
                }
              >
                {run.status === 'failed'
                  ? (run.error ??
                    intl.formatMessage({
                      id: 'admin.settings.imports.exportHistory.exportFailed',
                      defaultMessage: 'Export failed',
                    }))
                  : run.entityCounts
                    ? summarizeEntityCounts(run.entityCounts, formatNumber, intl)
                    : '-'}
              </TableCell>
              <TableCell>
                {run.status === 'completed' ? (
                  <span className="text-sm text-muted-foreground">
                    {intl.formatMessage(STATUS_LABEL[run.status])}
                  </span>
                ) : (
                  <Badge variant={STATUS_VARIANT[run.status]}>
                    {intl.formatMessage(STATUS_LABEL[run.status])}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {run.status === 'completed' && !isExpired(run) ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/export/runs/${run.id}/download`}>
                      <ArrowDownTrayIcon className="size-4" />
                      ZIP
                    </a>
                  </Button>
                ) : run.status === 'completed' && isExpired(run) ? (
                  <span className="text-sm text-muted-foreground">
                    {intl.formatMessage({ id: 'apiKeys.expired', defaultMessage: 'Expired' })}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
