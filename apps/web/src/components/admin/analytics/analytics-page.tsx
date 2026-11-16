import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { isProductEnabled, type FeatureFlags } from '@/lib/shared/types/settings'
import { analyticsQueries, periodRange, type AnalyticsPeriod } from '@/lib/client/queries/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { getTimeAgo } from '@/components/ui/time-ago'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/shared/page-header'
import { MENU_ICON, MENU_ROW } from '@/components/ui/menu'
import { cn } from '@/lib/shared/utils'
import { FunnelIcon, CalendarDaysIcon } from '@heroicons/react/24/solid'
import { CHART_HEIGHT_CLASS, channelLabel, formatResponseTime } from './analytics-constants'
import { SECTION_NAV_ITEMS, parseSection, type Section } from './analytics-sections'
import { AnalyticsSectionSelect } from './analytics-section-select'
import { AnalyticsSummaryCards, type MetricKey } from './analytics-summary-cards'
import { AnalyticsVisitorCards, type VisitorMetricKey } from './analytics-visitor-cards'
import { AnalyticsVisitorPanels } from './analytics-visitor-panels'
import { AnalyticsStatRow, type AnalyticsStatProps } from './analytics-stat-row'
import { AnalyticsSlaCards } from './analytics-sla-cards'
import { AnalyticsEmpty } from './analytics-empty'
import { AnalyticsBoardChart } from './analytics-board-chart'
import { AnalyticsChangelogCard } from './analytics-changelog-card'
import { AnalyticsTopPosts } from './analytics-top-posts'
import { AnalyticsTopContributors } from './analytics-top-contributors'
import { AnalyticsSignupSources } from './analytics-signup-sources'
import { AnalyticsCsatDistribution } from './analytics-csat-card'
import { AnalyticsResponseDistribution } from './analytics-response-distribution'
import { AnalyticsTeammatePerformance } from './analytics-teammate-performance'
import { ChartSkeleton, StatusChartSkeleton, SectionSkeleton } from './analytics-skeletons'
import { useWorkspaceSettings } from '@/lib/client/hooks/use-root-context'
import { useFormatNumber, type NumberFormatter } from '@/components/ui/format-number'
import type { IntlShape } from 'react-intl'

// Defer recharts (~580KB minified, including victory-vendor) and the chart
// primitives that wrap it. Analytics is admin-gated and rarely the first
// page hit, so SSR doesn't need recharts in the server bundle.
const AnalyticsActivityChart = lazy(() =>
  import('./analytics-activity-chart').then((m) => ({ default: m.AnalyticsActivityChart }))
)
const AnalyticsStatusChart = lazy(() =>
  import('./analytics-status-chart').then((m) => ({ default: m.AnalyticsStatusChart }))
)
const AnalyticsVisitorChart = lazy(() =>
  import('./analytics-visitor-chart').then((m) => ({ default: m.AnalyticsVisitorChart }))
)
const AnalyticsConversationVolumeChart = lazy(() =>
  import('./analytics-conversation-volume-chart').then((m) => ({
    default: m.AnalyticsConversationVolumeChart,
  }))
)
const AnalyticsFirstResponseChart = lazy(() =>
  import('./analytics-first-response-chart').then((m) => ({
    default: m.AnalyticsFirstResponseChart,
  }))
)
const AnalyticsTimeToCloseChart = lazy(() =>
  import('./analytics-time-to-close-chart').then((m) => ({
    default: m.AnalyticsTimeToCloseChart,
  }))
)

/** A section card matching the Overview: a divided headline stat row, then the
 *  section's visual beneath a hairline divider. */
function StatSection({ stats, children }: { stats: AnalyticsStatProps[]; children: ReactNode }) {
  return (
    <Card className="overflow-hidden py-0 gap-0">
      <AnalyticsStatRow stats={stats} />
      <div className="border-t border-border/50 px-4 sm:px-6 py-6">{children}</div>
    </Card>
  )
}

/** Integer average, guarding divide-by-zero, with thousands separators. */
function avgPerItem(formatNumber: NumberFormatter, total: number, count: number): string {
  return count > 0 ? formatNumber(Math.round(total / count)) : '0'
}

/** Period total per channel, in the series' volume-desc channel order. */
function channelTotals(volume: {
  channels: string[]
  days: Array<Record<string, string | number>>
}): Array<{ channel: string; total: number }> {
  return volume.channels.map((channel) => ({
    channel,
    total: volume.days.reduce((sum, d) => sum + (Number(d[channel]) || 0), 0),
  }))
}

/** Format a median resolution time (in days) as a stat value + unit suffix.
 *  null (nothing resolved in the period) renders as a hyphen. */
function formatResolveTime(
  intl: IntlShape,
  days: number | null
): { value: string; suffix?: string } {
  if (days == null) return { value: '-' }
  if (days < 1) {
    return {
      value: '<1',
      suffix: intl.formatMessage({ id: 'admin.analytics.stat.unitDay', defaultMessage: 'day' }),
    }
  }
  return {
    value: days < 10 ? days.toFixed(1) : Math.round(days).toString(),
    suffix: intl.formatMessage({ id: 'admin.analytics.stat.unitDays', defaultMessage: 'days' }),
  }
}

const periods: Array<{ value: AnalyticsPeriod; id: string; defaultMessage: string }> = [
  {
    value: '7d',
    id: 'portal.feedback.filter.date.last7Days',
    defaultMessage: 'Last 7 days',
  },
  {
    value: '30d',
    id: 'portal.feedback.filter.date.last30Days',
    defaultMessage: 'Last 30 days',
  },
  {
    value: '90d',
    id: 'portal.feedback.filter.date.last90Days',
    defaultMessage: 'Last 90 days',
  },
  {
    value: '12m',
    id: 'admin.analytics.period.last12Months',
    defaultMessage: 'Last 12 months',
  },
]

export function AnalyticsPage() {
  const intl = useOptionalIntl()
  const settings = useWorkspaceSettings()
  const formatNumber = useFormatNumber()
  const flags = settings?.featureFlags as FeatureFlags | undefined
  // Product reports follow product availability. Visitor reporting is always on.
  const sections = SECTION_NAV_ITEMS.filter(
    (i) =>
      (i.key !== 'feedback' || isProductEnabled(flags, 'feedback')) &&
      (i.key !== 'support' || isProductEnabled(flags, 'support')) &&
      (i.key !== 'changelog' || isProductEnabled(flags, 'changelog'))
  )

  const [period, setPeriod] = useState<AnalyticsPeriod>('30d')
  const activePeriod = periods.find((p) => p.value === period)
  // The section is part of the URL; one the workspace has switched off opens the overview.
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const requested = parseSection(search.section)
  const section: Section = sections.some((i) => i.key === requested) ? requested : 'overview'
  const setSection = (next: Section) =>
    void navigate({
      to: '/admin/analytics',
      search: (prev: Record<string, unknown>) => ({ ...prev, section: next }),
    })
  // The windows the Quinn and SLA cards read: fixed per period so their query keys stay stable.
  const range = useMemo(() => periodRange(period), [period])
  const [activeMetric, setActiveMetric] = useState<MetricKey>('posts')
  const [visitorMetric, setVisitorMetric] = useState<VisitorMetricKey>('visitors')
  const [surface, setSurface] = useState<'all' | 'portal'>('all')

  const { data, isLoading } = useQuery({
    ...analyticsQueries.data(period),
    placeholderData: keepPreviousData,
  })
  const { data: visitorData, isLoading: visitorLoading } = useQuery({
    ...analyticsQueries.visitors(period, surface),
    placeholderData: keepPreviousData,
    enabled: section === 'visitors',
  })

  return (
    <div className="flex h-full bg-background">
      {/* Left sidebar */}
      <aside
        data-side-pane=""
        className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-e border-chrome-hairline bg-background overflow-hidden"
      >
        <div className="shrink-0 px-5 py-3.5">
          <PageHeader
            as="h2"
            title={intl.formatMessage({ id: 'admin.nav.analytics', defaultMessage: 'Analytics' })}
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2.5 pb-5">
            <div className="space-y-1">
              {sections.map(({ key, label, icon: Icon }) => {
                const active = section === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSection(key)}
                    data-active={active || undefined}
                    className={cn(
                      MENU_ROW,
                      'w-full',
                      active
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn(MENU_ICON, active && 'text-primary')} />
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="w-full px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
            {/* Header: mobile title + section switcher (left) · updated + period (right) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 lg:hidden">
                <h1 className="text-base font-semibold">
                  {intl.formatMessage({ id: 'admin.nav.analytics', defaultMessage: 'Analytics' })}
                </h1>
                <AnalyticsSectionSelect items={sections} value={section} onChange={setSection} />
              </div>
              <div className="ml-auto flex items-center gap-3">
                {data?.computedAt && (
                  <p className="hidden text-sm text-muted-foreground sm:block">
                    {intl.formatMessage(
                      { id: 'portal.status.hero.updated', defaultMessage: 'Updated {time}' },
                      { time: getTimeAgo(data.computedAt, intl.locale) }
                    )}
                  </p>
                )}
                {/* Available filters for the active section (surface, today);
                    hidden when the section has none. */}
                {section === 'visitors' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="relative px-2.5">
                        <FunnelIcon className="h-4 w-4" />
                        {surface !== 'all' && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
                        )}
                        <span className="sr-only">
                          {intl.formatMessage({
                            id: 'admin.filterLayout.title',
                            defaultMessage: 'Filters',
                          })}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>
                        {intl.formatMessage({
                          id: 'admin.analytics.surface.title',
                          defaultMessage: 'Surface',
                        })}
                      </DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={surface}
                        onValueChange={(value) => setSurface(value as typeof surface)}
                      >
                        <DropdownMenuRadioItem value="all">
                          {intl.formatMessage({
                            id: 'admin.analytics.surface.all',
                            defaultMessage: 'All surfaces',
                          })}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="portal">
                          {intl.formatMessage({
                            id: 'admin.settings.tags.visibility.portal',
                            defaultMessage: 'Portal',
                          })}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <CalendarDaysIcon className="h-4 w-4" />
                      {activePeriod && intl.formatMessage(activePeriod)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuRadioGroup
                      value={period}
                      onValueChange={(value) => setPeriod(value as AnalyticsPeriod)}
                    >
                      {periods.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          {intl.formatMessage(option)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {isLoading ? (
              <SectionSkeleton section={section} />
            ) : !data ? null : (
              <>
                {section === 'overview' && (
                  <Card className="overflow-hidden py-0 gap-0">
                    <AnalyticsSummaryCards
                      summary={data.summary}
                      activeMetric={activeMetric}
                      onMetricChange={setActiveMetric}
                    />
                    <div className="border-t border-border/50 px-4 sm:px-6 pt-7 pb-6">
                      <Suspense fallback={<ChartSkeleton className={CHART_HEIGHT_CLASS} />}>
                        <AnalyticsActivityChart
                          dailyStats={data.dailyStats}
                          activeMetric={activeMetric}
                        />
                      </Suspense>
                    </div>
                  </Card>
                )}

                {section === 'visitors' &&
                  (visitorLoading || !visitorData ? (
                    <SectionSkeleton section="overview" />
                  ) : !visitorData.enabled ? (
                    <Card className="overflow-hidden">
                      <AnalyticsEmpty
                        message={intl.formatMessage({
                          id: 'admin.analytics.visitorsDisabled',
                          defaultMessage: 'Visitor analytics is turned off',
                        })}
                      />
                    </Card>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <Card className="overflow-hidden py-0 gap-0">
                        <AnalyticsVisitorCards
                          totals={{
                            visitors: visitorData.uniqueVisitors,
                            pageviews: visitorData.pageviews,
                            visits: visitorData.visits,
                          }}
                          activeMetric={visitorMetric}
                          onMetricChange={setVisitorMetric}
                        />
                        <div className="border-t border-border/50 px-4 sm:px-6 pt-7 pb-6">
                          <Suspense fallback={<ChartSkeleton className={CHART_HEIGHT_CLASS} />}>
                            <AnalyticsVisitorChart
                              dailyStats={visitorData.dailyStats}
                              activeMetric={visitorMetric}
                            />
                          </Suspense>
                        </div>
                      </Card>
                      <AnalyticsVisitorPanels top={visitorData.top} />
                    </div>
                  ))}

                {section === 'feedback' && (
                  <div className="flex flex-col gap-6">
                    <StatSection
                      stats={[
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.posts',
                            defaultMessage: 'Posts',
                          }),
                          value: formatNumber(data.summary.posts.total),
                          delta: data.summary.posts.delta,
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.resolved',
                            defaultMessage: 'Resolved',
                          }),
                          value: `${data.resolutionRate}%`,
                          caption: intl.formatMessage({
                            id: 'admin.analytics.caption.current',
                            defaultMessage: 'current',
                          }),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.medianResolve',
                            defaultMessage: 'Median resolve',
                          }),
                          ...formatResolveTime(intl, data.medianResolutionDays),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.followers',
                            defaultMessage: 'Followers',
                          }),
                          value: formatNumber(data.followers),
                          caption: intl.formatMessage({
                            id: 'admin.analytics.caption.current',
                            defaultMessage: 'current',
                          }),
                        },
                      ]}
                    >
                      <Suspense fallback={<StatusChartSkeleton />}>
                        <AnalyticsStatusChart data={data.statusDistribution} />
                      </Suspense>
                    </StatSection>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            {intl.formatMessage({
                              id: 'admin.analytics.section.boards',
                              defaultMessage: 'Boards',
                            })}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-[320px] overflow-y-auto scrollbar-thin">
                          <AnalyticsBoardChart data={data.boardBreakdown} />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            {intl.formatMessage({
                              id: 'admin.analytics.section.topPosts',
                              defaultMessage: 'Top posts',
                            })}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-[320px] overflow-y-auto scrollbar-thin">
                          <AnalyticsTopPosts posts={data.topPosts} />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {section === 'support' && (
                  <div className="flex flex-col gap-6">
                    <StatSection
                      stats={[
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.newConversations',
                            defaultMessage: 'New conversations',
                          }),
                          value: formatNumber(data.conversationVolume.total),
                          delta: data.conversationVolume.delta,
                        },
                        // Per-channel totals for the top channels, in the same
                        // volume-desc order the stack below uses.
                        ...channelTotals(data.conversationVolume)
                          .slice(0, 3)
                          .map((c) => ({
                            label: channelLabel(c.channel),
                            value: formatNumber(c.total),
                          })),
                      ]}
                    >
                      <Suspense fallback={<ChartSkeleton />}>
                        <AnalyticsConversationVolumeChart volume={data.conversationVolume} />
                      </Suspense>
                    </StatSection>
                    <StatSection
                      stats={[
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.medianFirstResponse',
                            defaultMessage: 'Median first response',
                          }),
                          value: formatResponseTime(data.firstResponse.medianMinutes),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.answered',
                            defaultMessage: 'Answered',
                          }),
                          value: formatNumber(data.firstResponse.responded),
                          caption: intl.formatMessage({
                            id: 'admin.analytics.caption.conversations',
                            defaultMessage: 'conversations',
                          }),
                        },
                      ]}
                    >
                      <Suspense fallback={<ChartSkeleton />}>
                        <AnalyticsFirstResponseChart days={data.firstResponse.days} />
                      </Suspense>
                    </StatSection>
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {intl.formatMessage({
                            id: 'admin.analytics.section.firstResponseDistribution',
                            defaultMessage: 'First response distribution',
                          })}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AnalyticsResponseDistribution distribution={data.responseDistribution} />
                      </CardContent>
                    </Card>
                    <StatSection
                      stats={[
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.medianTimeToClose',
                            defaultMessage: 'Median time to close',
                          }),
                          value: formatResponseTime(data.timeToClose.medianMinutes),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.closed',
                            defaultMessage: 'Closed',
                          }),
                          value: formatNumber(data.timeToClose.closed),
                          caption: intl.formatMessage({
                            id: 'admin.analytics.caption.conversations',
                            defaultMessage: 'conversations',
                          }),
                        },
                      ]}
                    >
                      <Suspense fallback={<ChartSkeleton />}>
                        <AnalyticsTimeToCloseChart days={data.timeToClose.days} />
                      </Suspense>
                    </StatSection>
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {intl.formatMessage({
                            id: 'admin.analytics.section.teammatePerformance',
                            defaultMessage: 'Teammate performance',
                          })}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AnalyticsTeammatePerformance teammates={data.teammatePerformance} />
                      </CardContent>
                    </Card>
                    {data.csat.responseCount === 0 ? (
                      <Card className="overflow-hidden">
                        <AnalyticsEmpty
                          message={intl.formatMessage({
                            id: 'admin.analytics.empty.csat',
                            defaultMessage: 'No CSAT responses for this period',
                          })}
                        />
                      </Card>
                    ) : (
                      <StatSection
                        stats={[
                          {
                            label: intl.formatMessage({
                              id: 'admin.analytics.stat.avgRating',
                              defaultMessage: 'Avg rating',
                            }),
                            value: data.csat.avgRating.toFixed(1),
                            suffix: intl.formatMessage({
                              id: 'admin.analytics.stat.ratingMax',
                              defaultMessage: '/ 5',
                            }),
                            delta: data.csat.avgRatingDelta,
                          },
                          {
                            label: intl.formatMessage({
                              id: 'admin.analytics.stat.responses',
                              defaultMessage: 'Responses',
                            }),
                            value: formatNumber(data.csat.responseCount),
                          },
                          {
                            label: intl.formatMessage({
                              id: 'admin.analytics.stat.responseRate',
                              defaultMessage: 'Response rate',
                            }),
                            value: `${data.csat.responseRate}%`,
                          },
                        ]}
                      >
                        <AnalyticsCsatDistribution distribution={data.csat.distribution} />
                      </StatSection>
                    )}
                    <AnalyticsSlaCards range={range} />
                  </div>
                )}

                {section === 'changelog' && (
                  <StatSection
                    stats={[
                      {
                        label: intl.formatMessage({
                          id: 'admin.changelog.status.published',
                          defaultMessage: 'Published',
                        }),
                        value: formatNumber(data.changelog.publishedInPeriod),
                      },
                      {
                        label: intl.formatMessage({
                          id: 'admin.analytics.stat.totalViews',
                          defaultMessage: 'Total views',
                        }),
                        value: formatNumber(data.changelog.totalViews),
                        caption: intl.formatMessage({
                          id: 'admin.analytics.caption.allTime',
                          defaultMessage: 'all time',
                        }),
                      },
                      {
                        label: intl.formatMessage({
                          id: 'admin.analytics.stat.avgPerEntry',
                          defaultMessage: 'Avg / entry',
                        }),
                        value: avgPerItem(
                          formatNumber,
                          data.changelog.totalViews,
                          data.changelog.publishedCount
                        ),
                        caption: intl.formatMessage({
                          id: 'admin.analytics.caption.allTime',
                          defaultMessage: 'all time',
                        }),
                      },
                    ]}
                  >
                    <AnalyticsChangelogCard topEntries={data.changelog.topEntries} />
                  </StatSection>
                )}

                {section === 'users' && (
                  <div className="flex flex-col gap-6">
                    <StatSection
                      stats={[
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.signups',
                            defaultMessage: 'Signups',
                          }),
                          value: formatNumber(data.summary.users.total),
                          delta: data.summary.users.delta,
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.newLeads',
                            defaultMessage: 'New leads',
                          }),
                          value: formatNumber(data.newLeads.total),
                          delta: data.newLeads.delta,
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.activeUsers',
                            defaultMessage: 'Active users',
                          }),
                          value: formatNumber(data.activeUsers),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.verified',
                            defaultMessage: 'Verified',
                          }),
                          value: `${data.verifiedRate}%`,
                          caption: intl.formatMessage({
                            id: 'admin.analytics.caption.allTime',
                            defaultMessage: 'all time',
                          }),
                        },
                        {
                          label: intl.formatMessage({
                            id: 'admin.analytics.stat.contributors',
                            defaultMessage: 'Contributors',
                          }),
                          value: formatNumber(data.contributorCount),
                        },
                      ]}
                    >
                      <AnalyticsTopContributors contributors={data.topContributors} />
                    </StatSection>
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {intl.formatMessage({
                            id: 'admin.analytics.section.signupsBySource',
                            defaultMessage: 'Signups by source',
                          })}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AnalyticsSignupSources sources={data.signupsBySource} />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
