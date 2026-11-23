import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supportReportingQuery } from '@/lib/client/queries/support-reporting'
import type { DateRange } from '@/lib/client/queries/analytics'
import { formatSlaCountdown } from '@/lib/shared/conversation/sla'
import type { SlaAttainment, SlaBreachHeatmapCell } from '@/lib/server/domains/sla/sla-reporting'
import { AnalyticsEmpty } from './analytics-empty'
import { LoadError } from './analytics-load-error'
import { ChartSkeleton } from './analytics-skeletons'

const CLOCKS: { key: keyof SlaAttainment; id: string; defaultMessage: string }[] = [
  {
    key: 'firstResponse',
    id: 'admin.settings.sla.firstResponse',
    defaultMessage: 'First response',
  },
  {
    key: 'nextResponse',
    id: 'admin.settings.sla.nextResponse',
    defaultMessage: 'Next response',
  },
  {
    key: 'resolution',
    id: 'admin.settings.sla.timeToClose',
    defaultMessage: 'Time to close',
  },
  {
    key: 'timeToResolve',
    id: 'admin.settings.sla.timeToResolve',
    defaultMessage: 'Time to resolve',
  },
]

/** ISODOW 1 (Monday) to 7 (Sunday), matching the heatmap cells' `dow`. */
const DOW_LABELS = [
  { id: 'admin.analytics.dow.mon', defaultMessage: 'Mon' },
  { id: 'admin.analytics.dow.tue', defaultMessage: 'Tue' },
  { id: 'admin.analytics.dow.wed', defaultMessage: 'Wed' },
  { id: 'admin.analytics.dow.thu', defaultMessage: 'Thu' },
  { id: 'admin.analytics.dow.fri', defaultMessage: 'Fri' },
  { id: 'admin.analytics.dow.sat', defaultMessage: 'Sat' },
  { id: 'admin.analytics.dow.sun', defaultMessage: 'Sun' },
]

/** A 0-1 attainment rate as a whole percent; a clock nothing was tracked on reads as a hyphen. */
function rateLabel(rate: number | null | undefined): string {
  return rate == null ? '-' : `${Math.round(rate * 100)}%`
}

/** 7x24 day-of-week by hour grid, shaded by breach count (UTC). */
function BreachHeatmap({ cells }: { cells: SlaBreachHeatmapCell[] }) {
  const intl = useOptionalIntl()
  const lookup = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.count] as const))
  const max = Math.max(0, ...cells.map((c) => c.count))
  if (max === 0)
    return (
      <AnalyticsEmpty
        className="h-24"
        message={intl.formatMessage({
          id: 'admin.analytics.sla.noBreaches',
          defaultMessage: 'No breaches in this period',
        })}
      />
    )
  return (
    <div className="space-y-0.5">
      {DOW_LABELS.map((dowLabel, i) => {
        const dow = i + 1
        const label = intl.formatMessage(dowLabel)
        return (
          <div key={dowLabel.id} className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">{label}</span>
            <div className="flex flex-1 gap-0.5">
              {Array.from({ length: 24 }, (_, hour) => {
                const n = lookup.get(`${dow}:${hour}`) ?? 0
                return (
                  <div
                    key={hour}
                    title={intl.formatMessage(
                      {
                        id: 'admin.analytics.sla.heatmapCell',
                        defaultMessage:
                          '{day} {hour}:00, {count, plural, one {# breach} other {# breaches}}',
                      },
                      { day: label, hour: String(hour).padStart(2, '0'), count: n }
                    )}
                    className="h-3.5 flex-1 rounded-[2px] bg-primary"
                    style={{ opacity: n === 0 ? 0.08 : 0.15 + 0.85 * (n / max) }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0" />
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1 text-center text-xs text-muted-foreground">
              {h % 6 === 0 ? h : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The Support section's SLA cards: attainment per clock and per policy,
 *  breaches by hour, and time after a miss. */
export function AnalyticsSlaCards({ range }: { range: DateRange }) {
  const intl = useOptionalIntl()
  const { data, isError, refetch } = useQuery(supportReportingQuery(range.from, range.to))

  if (isError && !data) {
    return (
      <Card className="overflow-hidden py-0">
        <LoadError
          message={intl.formatMessage({
            id: 'admin.analytics.sla.loadFailed',
            defaultMessage: 'SLA results could not be loaded.',
          })}
          onRetry={() => void refetch()}
        />
      </Card>
    )
  }
  if (!data) return <ChartSkeleton className="h-64 rounded-xl" />

  const missed = CLOCKS.filter((c) => data.slaTimeAfterMiss[c.key].count > 0)

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
        <Card>
          <CardHeader>
            <CardTitle>
              {intl.formatMessage({
                id: 'admin.analytics.sla.attainmentTitle',
                defaultMessage: 'SLA attainment',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.target',
                      defaultMessage: 'Target',
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.met',
                      defaultMessage: 'Met',
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.missed',
                      defaultMessage: 'Missed',
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.attained',
                      defaultMessage: 'Attained',
                    })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CLOCKS.map((c) => {
                  const clock = data.sla[c.key]
                  return (
                    <TableRow key={c.key}>
                      <TableCell>{intl.formatMessage(c)}</TableCell>
                      <TableCell className="text-right tabular-nums">{clock.met}</TableCell>
                      <TableCell className="text-right tabular-nums">{clock.breached}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rateLabel(clock.rate)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {data.slaByPolicy.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {intl.formatMessage({
                        id: 'admin.analytics.sla.column.policy',
                        defaultMessage: 'Policy',
                      })}
                    </TableHead>
                    {CLOCKS.map((c) => (
                      <TableHead key={c.key} className="text-right">
                        {intl.formatMessage(c)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.slaByPolicy.map((p) => (
                    <TableRow key={p.policyId}>
                      <TableCell className="max-w-40 truncate">{p.policyName}</TableCell>
                      {CLOCKS.map((c) => (
                        <TableCell key={c.key} className="text-right tabular-nums">
                          {rateLabel(p[c.key].rate)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {intl.formatMessage({
              id: 'admin.analytics.sla.breachesByHour',
              defaultMessage: 'Breaches by hour',
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BreachHeatmap cells={data.slaHeatmap} />
          <p className="mt-2 text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.analytics.sla.timesUtc',
              defaultMessage: 'Times are UTC.',
            })}
          </p>
        </CardContent>
      </Card>

      {missed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {intl.formatMessage({
                id: 'admin.analytics.sla.timeAfterMiss',
                defaultMessage: 'Time after a miss',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.target',
                      defaultMessage: 'Target',
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.misses',
                      defaultMessage: 'Misses',
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage({
                      id: 'admin.analytics.sla.column.averageOverdue',
                      defaultMessage: 'Average overdue',
                    })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missed.map((c) => {
                  const m = data.slaTimeAfterMiss[c.key]
                  return (
                    <TableRow key={c.key}>
                      <TableCell>{intl.formatMessage(c)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.avgOverdueSecs == null
                          ? '-'
                          : formatSlaCountdown(m.avgOverdueSecs * 1000)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
