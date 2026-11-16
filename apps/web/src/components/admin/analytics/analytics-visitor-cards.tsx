import type { MessageDescriptor } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsMetricStrip } from './analytics-metric-strip'

export type VisitorMetricKey = 'visitors' | 'pageviews' | 'visits'

export const VISITOR_METRICS: Array<{
  key: VisitorMetricKey
  label: MessageDescriptor
  color: string
  /** Field name in the daily-stats rows the chart plots. */
  dataKey: 'uniqueVisitors' | 'pageviews' | 'visits'
}> = [
  {
    key: 'visitors',
    label: { id: 'admin.analytics.metric.uniqueVisitors', defaultMessage: 'Unique visitors' },
    color: 'var(--metric-visitors)',
    dataKey: 'uniqueVisitors',
  },
  {
    key: 'pageviews',
    label: { id: 'admin.analytics.metric.pageviews', defaultMessage: 'Pageviews' },
    color: 'var(--metric-pageviews)',
    dataKey: 'pageviews',
  },
  {
    key: 'visits',
    label: { id: 'admin.analytics.metric.visits', defaultMessage: 'Visits' },
    color: 'var(--metric-visits)',
    dataKey: 'visits',
  },
]

interface VisitorCardsProps {
  totals: Record<VisitorMetricKey, { current: number; delta: number | null }>
  activeMetric: VisitorMetricKey
  onMetricChange: (key: VisitorMetricKey) => void
}

/** The visitor metric strip: same chart-tab interaction as the Overview. */
export function AnalyticsVisitorCards({ totals, activeMetric, onMetricChange }: VisitorCardsProps) {
  const intl = useOptionalIntl()
  return (
    <AnalyticsMetricStrip
      items={VISITOR_METRICS.map(({ key, label, color }) => ({
        key,
        label: intl.formatMessage(label),
        color,
        value: totals[key].current,
        delta: totals[key].delta,
      }))}
      activeKey={activeMetric}
      onChange={(key) => onMetricChange(key as VisitorMetricKey)}
      gridClassName="grid-cols-3 divide-x"
    />
  )
}
