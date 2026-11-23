import type { MessageDescriptor } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsAreaChart } from './analytics-area-chart'
import type { MetricKey } from './analytics-summary-cards'

interface ActivityChartProps {
  dailyStats: Array<{ date: string; posts: number; votes: number; comments: number; users: number }>
  activeMetric: MetricKey
}

const CHART_BINDINGS: Record<
  MetricKey,
  { dataKey: string; metric: string; label: MessageDescriptor }
> = {
  posts: {
    dataKey: 'posts',
    metric: 'posts',
    label: { id: 'admin.analytics.stat.posts', defaultMessage: 'Posts' },
  },
  votes: {
    dataKey: 'votes',
    metric: 'votes',
    label: { id: 'common.userStats.votes', defaultMessage: 'Votes' },
  },
  // The metric key is 'postComments' but the daily rows and the color token
  // are both named 'comments'.
  postComments: {
    dataKey: 'comments',
    metric: 'comments',
    label: { id: 'common.userStats.comments', defaultMessage: 'Comments' },
  },
  users: {
    dataKey: 'users',
    metric: 'users',
    label: { id: 'admin.nav.users', defaultMessage: 'Users' },
  },
}

export function AnalyticsActivityChart({ dailyStats, activeMetric }: ActivityChartProps) {
  const intl = useOptionalIntl()
  const { dataKey, metric, label } = CHART_BINDINGS[activeMetric]
  return (
    <AnalyticsAreaChart
      data={dailyStats}
      dataKey={dataKey}
      label={intl.formatMessage(label)}
      metric={metric}
    />
  )
}
