import type { MessageDescriptor } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsMetricStrip } from './analytics-metric-strip'

export type MetricKey = 'posts' | 'votes' | 'postComments' | 'users'

export const METRICS: Array<{ key: MetricKey; label: MessageDescriptor; color: string }> = [
  {
    key: 'posts',
    label: { id: 'admin.analytics.stat.posts', defaultMessage: 'Posts' },
    color: 'var(--metric-posts)',
  },
  {
    key: 'votes',
    label: { id: 'common.userStats.votes', defaultMessage: 'Votes' },
    color: 'var(--metric-votes)',
  },
  {
    key: 'postComments',
    label: { id: 'common.userStats.comments', defaultMessage: 'Comments' },
    color: 'var(--metric-comments)',
  },
  {
    key: 'users',
    label: { id: 'admin.nav.users', defaultMessage: 'Users' },
    color: 'var(--metric-users)',
  },
]

interface MetricBarProps {
  summary: {
    posts: { total: number; delta: number }
    votes: { total: number; delta: number }
    postComments: { total: number; delta: number }
    users: { total: number; delta: number }
  }
  activeMetric: MetricKey
  onMetricChange: (key: MetricKey) => void
}

export function AnalyticsSummaryCards({ summary, activeMetric, onMetricChange }: MetricBarProps) {
  const intl = useOptionalIntl()
  return (
    <AnalyticsMetricStrip
      items={METRICS.map(({ key, label, color }) => ({
        key,
        label: intl.formatMessage(label),
        color,
        value: summary[key].total,
        delta: summary[key].delta,
      }))}
      activeKey={activeMetric}
      onChange={(key) => onMetricChange(key as MetricKey)}
      gridClassName="grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x"
    />
  )
}
