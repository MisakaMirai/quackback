import { useMemo } from 'react'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsBarList } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

interface BoardChartProps {
  data: Array<{ board: string; count: number }>
}

export function AnalyticsBoardChart({ data }: BoardChartProps) {
  const intl = useOptionalIntl()
  const sorted = useMemo(() => [...data].sort((a, b) => b.count - a.count), [data])

  if (sorted.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.noData',
          defaultMessage: 'No data for this period',
        })}
      />
    )
  }

  return (
    <AnalyticsBarList
      header={{
        label: intl.formatMessage({
          id: 'admin.analytics.column.board',
          defaultMessage: 'Board',
        }),
        value: intl.formatMessage({ id: 'admin.analytics.stat.posts', defaultMessage: 'Posts' }),
      }}
      rows={sorted.map((item, i) => ({
        // Board names aren't guaranteed unique, so disambiguate with the index.
        key: `${item.board}-${i}`,
        label: item.board,
        value: item.count,
      }))}
    />
  )
}
