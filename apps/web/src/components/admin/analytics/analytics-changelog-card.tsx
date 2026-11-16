import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsBarList } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

interface ChangelogCardProps {
  topEntries: Array<{ id: string; title: string; viewCount: number }>
}

export function AnalyticsChangelogCard({ topEntries }: ChangelogCardProps) {
  const intl = useOptionalIntl()
  if (topEntries.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.changelog',
          defaultMessage: 'No changelog entries yet',
        })}
      />
    )
  }

  return (
    <AnalyticsBarList
      header={{
        label: intl.formatMessage({
          id: 'admin.analytics.column.entry',
          defaultMessage: 'Entry',
        }),
        value: intl.formatMessage({
          id: 'admin.analytics.column.views',
          defaultMessage: 'Views',
        }),
      }}
      rows={topEntries.map((entry) => ({
        key: entry.id,
        label: entry.title,
        value: entry.viewCount,
      }))}
    />
  )
}
