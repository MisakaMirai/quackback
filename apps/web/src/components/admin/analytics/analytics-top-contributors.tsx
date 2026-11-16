import { Avatar } from '@/components/ui/avatar'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsBarList } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

interface TopContributorsProps {
  contributors: Array<{
    principalId: string
    displayName: string | null
    avatarUrl: string | null
    posts: number
    votes: number
    comments: number
    total: number
  }>
}

export function AnalyticsTopContributors({ contributors }: TopContributorsProps) {
  const intl = useOptionalIntl()
  if (contributors.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.contributors',
          defaultMessage: 'No contributor activity in this period',
        })}
      />
    )
  }

  return (
    <AnalyticsBarList
      header={{
        label: intl.formatMessage({
          id: 'admin.analytics.column.contributor',
          defaultMessage: 'Contributor',
        }),
        value: intl.formatMessage({
          id: 'admin.analytics.column.activity',
          defaultMessage: 'Activity',
        }),
      }}
      rows={contributors.map((c) => ({
        key: c.principalId,
        value: c.total,
        leading: (
          <Avatar
            src={c.avatarUrl}
            name={c.displayName}
            className="relative size-5 shrink-0 text-xs"
          />
        ),
        label:
          c.displayName ??
          intl.formatMessage({
            id: 'admin.analytics.column.anonymous',
            defaultMessage: 'Anonymous',
          }),
      }))}
    />
  )
}
