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
import { ArchiveBoxIcon } from '@heroicons/react/24/solid'
import { settingsQueries } from '@/lib/client/queries/settings'
import type { ImportRunListItem } from '@/lib/server/functions/data-runs'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

const IN_FLIGHT_STATUSES = new Set(['pending', 'dry_run', 'running'])

const STATUS_LABEL: Record<ImportRunListItem['status'], { id: string; defaultMessage: string }> = {
  pending: { id: 'admin.settings.imports.status.queued', defaultMessage: 'Queued' },
  dry_run: { id: 'admin.settings.imports.status.validating', defaultMessage: 'Validating' },
  running: { id: 'admin.settings.imports.status.importing', defaultMessage: 'Importing' },
  completed: { id: 'portal.status.lifecycle.completed', defaultMessage: 'Completed' },
  failed: { id: 'admin.settings.imports.status.failed', defaultMessage: 'Failed' },
}

const STATUS_VARIANT: Record<
  ImportRunListItem['status'],
  'secondary' | 'default' | 'destructive' | 'success'
> = {
  pending: 'secondary',
  dry_run: 'secondary',
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
}

const SOURCE_LABEL: Record<ImportRunListItem['source'], string> = {
  csv: 'CSV',
  uservoice: 'UserVoice',
  canny: 'Canny',
  api: 'API',
}

function downloadErrorReport(run: ImportRunListItem): void {
  const blob = new Blob([JSON.stringify(run.errorReport ?? [], null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `import-errors-${run.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportHistoryList() {
  const intl = useOptionalIntl()
  const { data: runs, isLoading } = useQuery({
    ...settingsQueries.importRuns(),
    refetchInterval: (query) => {
      const rows = query.state.data
      return rows?.some((r) => IN_FLIGHT_STATUSES.has(r.status)) ? 2000 : false
    },
  })

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({
          id: 'admin.settings.imports.history.loading',
          defaultMessage: 'Loading import history...',
        })}
      </p>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <EmptyState
        icon={ArchiveBoxIcon}
        title={intl.formatMessage({
          id: 'admin.settings.imports.history.emptyTitle',
          defaultMessage: 'No imports yet',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.imports.history.emptyDescription',
          defaultMessage: 'Runs you start above show up here with their status and counts.',
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
                id: 'admin.settings.imports.history.source',
                defaultMessage: 'Source',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({ id: 'files.family.other', defaultMessage: 'File' })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.changelog.filters.status',
                defaultMessage: 'Status',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.settings.imports.history.counts',
                defaultMessage: 'Counts',
              })}
            </TableHead>
            <TableHead>
              {intl.formatMessage({
                id: 'admin.settings.imports.started',
                defaultMessage: 'Started',
              })}
            </TableHead>
            <TableHead className="text-right">
              {intl.formatMessage({
                id: 'admin.settings.imports.history.errors',
                defaultMessage: 'Errors',
              })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{SOURCE_LABEL[run.source]}</TableCell>
              <TableCell className="max-w-[220px] truncate" title={run.fileName}>
                {run.fileName}
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
              <TableCell className="text-sm text-muted-foreground">
                {run.totals ? (
                  <>
                    {intl.formatMessage(
                      {
                        id: 'admin.settings.imports.csv.createdCount',
                        defaultMessage: '{count} created',
                      },
                      { count: run.totals.created }
                    )}
                    {run.totals.updated > 0 &&
                      intl.formatMessage(
                        {
                          id: 'admin.settings.imports.csv.updatedSuffix',
                          defaultMessage: ', {count} updated',
                        },
                        { count: run.totals.updated }
                      )}
                    {run.totals.skipped > 0 &&
                      intl.formatMessage(
                        {
                          id: 'admin.settings.imports.csv.skippedSuffix',
                          defaultMessage: ', {count} skipped',
                        },
                        { count: run.totals.skipped }
                      )}
                  </>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <TimeAgo date={run.createdAt} />
              </TableCell>
              <TableCell className="text-right">
                {run.errorReport && run.errorReport.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => downloadErrorReport(run)}>
                    <ArrowDownTrayIcon className="size-4" />
                    {run.errorReport.length}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
