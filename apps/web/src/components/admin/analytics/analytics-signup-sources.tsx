import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { AnalyticsBarList } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

interface SignupSourcesProps {
  sources: Array<{ source: string; count: number }>
}

/** Acquisition-channel breakdown of new signups in the period (Email, Google,
 *  SSO, …), as a proportional bar list. */
export function AnalyticsSignupSources({ sources }: SignupSourcesProps) {
  const intl = useOptionalIntl()
  if (sources.length === 0) {
    return (
      <AnalyticsEmpty
        message={intl.formatMessage({
          id: 'admin.analytics.empty.signups',
          defaultMessage: 'No signups in this period',
        })}
      />
    )
  }

  return (
    <AnalyticsBarList
      header={{
        label: intl.formatMessage({
          id: 'admin.analytics.column.source',
          defaultMessage: 'Source',
        }),
        value: intl.formatMessage({
          id: 'admin.analytics.stat.signups',
          defaultMessage: 'Signups',
        }),
      }}
      rows={sources.map((s) => ({ key: s.source, label: s.source, value: s.count }))}
    />
  )
}
