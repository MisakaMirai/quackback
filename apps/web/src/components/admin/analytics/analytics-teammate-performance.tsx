import { Avatar } from '@/components/ui/avatar'
import { useFormatNumber } from '@/components/ui/format-number'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { AnalyticsEmpty } from './analytics-empty'
import { formatResponseTime } from './analytics-constants'
import type { TeammatePerformance } from '@/lib/server/domains/analytics/teammate-performance'

/** Per-teammate support workload: conversations handled with median first
 *  response and median time to close. Rows arrive sorted by handled desc. */
export function AnalyticsTeammatePerformance({ teammates }: { teammates: TeammatePerformance[] }) {
  const intl = useOptionalIntl()
  const formatNumber = useFormatNumber()
  if (teammates.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.teammates',
          defaultMessage: 'No assigned conversations in this period',
        })}
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            {intl.formatMessage({
              id: 'admin.analytics.table.teammate',
              defaultMessage: 'Teammate',
            })}
          </TableHead>
          <TableHead className="text-right">
            {intl.formatMessage({
              id: 'admin.analytics.table.conversations',
              defaultMessage: 'Conversations',
            })}
          </TableHead>
          <TableHead className="text-right">
            {intl.formatMessage({
              id: 'admin.analytics.stat.medianFirstResponse',
              defaultMessage: 'Median first response',
            })}
          </TableHead>
          <TableHead className="text-right">
            {intl.formatMessage({
              id: 'admin.analytics.stat.medianTimeToClose',
              defaultMessage: 'Median time to close',
            })}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teammates.map((t) => (
          <TableRow key={t.agentId}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar
                  src={t.avatarUrl}
                  name={t.displayName}
                  className="size-5 shrink-0 text-xs"
                />
                <span className="truncate font-medium">{t.displayName}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(t.handled)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatResponseTime(t.medianFirstResponseMinutes)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatResponseTime(t.medianCloseMinutes)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
