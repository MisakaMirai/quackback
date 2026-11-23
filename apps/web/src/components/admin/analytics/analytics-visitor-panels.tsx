import type { MessageDescriptor } from 'react-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { countryName, countryFlag } from '@/lib/shared/country'
import { AnalyticsBarList, type BarListRow } from './analytics-bar-list'
import { AnalyticsEmpty } from './analytics-empty'

type TopBreakdowns = Record<string, Array<{ label: string; count: number }>>

const PANELS: Array<{
  dimension: string
  title: MessageDescriptor
  header: MessageDescriptor
  format?: (label: string) => BarListRow['label']
}> = [
  {
    dimension: 'page',
    title: { id: 'admin.analytics.panel.topPages', defaultMessage: 'Top pages' },
    header: { id: 'admin.analytics.column.page', defaultMessage: 'Page' },
  },
  {
    dimension: 'source',
    title: { id: 'admin.analytics.panel.sources', defaultMessage: 'Sources' },
    header: { id: 'admin.analytics.column.source', defaultMessage: 'Source' },
  },
  {
    dimension: 'country',
    title: { id: 'admin.analytics.panel.countries', defaultMessage: 'Countries' },
    header: { id: 'admin.analytics.column.country', defaultMessage: 'Country' },
    format: (code) => `${countryFlag(code)} ${countryName(code)}`,
  },
  {
    dimension: 'device',
    title: { id: 'admin.analytics.panel.devices', defaultMessage: 'Devices' },
    header: { id: 'admin.analytics.column.device', defaultMessage: 'Device' },
  },
  {
    dimension: 'browser',
    title: { id: 'admin.analytics.panel.browsers', defaultMessage: 'Browsers' },
    header: { id: 'admin.analytics.column.browser', defaultMessage: 'Browser' },
  },
  {
    dimension: 'os',
    title: { id: 'admin.analytics.panel.operatingSystems', defaultMessage: 'Operating systems' },
    header: { id: 'admin.analytics.column.os', defaultMessage: 'OS' },
  },
]

/** The breakdown grid: six visitor-ranked bar lists fed by the rollup
 *  snapshots (top 10 per dimension for the selected period + surface). */
export function AnalyticsVisitorPanels({ top }: { top: TopBreakdowns }) {
  const intl = useOptionalIntl()
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 md:items-start">
      {PANELS.map(({ dimension, title, header, format }) => {
        const rows = top[dimension] ?? []
        return (
          <Card key={dimension}>
            <CardHeader>
              <CardTitle>{intl.formatMessage(title)}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[320px] overflow-y-auto scrollbar-thin">
              {rows.length === 0 ? (
                <AnalyticsEmpty
                  message={intl.formatMessage({
                    id: 'admin.analytics.empty.noData',
                    defaultMessage: 'No data for this period',
                  })}
                />
              ) : (
                <AnalyticsBarList
                  header={{
                    label: intl.formatMessage(header),
                    value: intl.formatMessage({
                      id: 'admin.analytics.column.visitors',
                      defaultMessage: 'Visitors',
                    }),
                  }}
                  rows={rows.map((row) => ({
                    key: row.label,
                    label: format ? format(row.label) : row.label,
                    value: row.count,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
