/**
 * Admin Overview: the on-call landing view (Status Admin Redesign spec,
 * Phase 2). Answers "what does the public see right now" before anything
 * else: a banner mirroring the portal hero (same worst-of derivation, same
 * copy), active incidents and maintenance in progress with Post update one
 * click away, upcoming maintenance with Start now, service health, and stat
 * tiles.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { AnalyticsStatRow } from '@/components/admin/analytics/analytics-stat-row'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormatNumber } from '@/components/ui/format-number'
import { TimeAgo } from '@/components/ui/time-ago'
import { useLocalDateFormatter, type LocalDateFormatter } from '@/components/ui/local-date'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Route } from '@/routes/admin/status'
import { statusOverviewQueries, type StatusOverview } from '@/lib/client/queries/status'
import { useStartStatusMaintenanceNow } from '@/lib/client/mutations/status'
import { LifecycleBadge } from './status-incident-fields'
import { ReportIncidentDialog } from './status-report-incident-dialog'
import { ScheduleMaintenanceDialog } from './status-schedule-maintenance-dialog'
import { useStatusAccess } from './status-access'
import { FormattedMessage, type IntlShape } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { NewButton } from '@/components/shared/new-button'
import {
  COMPONENT_STATUS_COLORS,
  IMPACT_COLORS,
  type StatusComponentStatus,
  type StatusIncidentLifecycle,
} from './status-admin-colors'
import {
  COMPONENT_STATUS_LABEL,
  HERO_HEADLINE,
  IMPACT_LABEL,
} from '@/components/portal/status/status-colors'
import { toastError } from '@/lib/client/error-notice'

type OverviewIncident = StatusOverview['activeIncidents'][number]

export function StatusOverviewView() {
  const intl = useOptionalIntl()
  const { data, isLoading, isError, isFetching, refetch } = useQuery(statusOverviewQueries.get())
  const { canPublish, canManage } = useStatusAccess()

  return (
    <div className="max-w-5xl w-full flex flex-col flex-1 min-h-0">
      <div className="px-3 pt-3.5">
        <PageHeader
          title={intl.formatMessage({
            id: 'admin.status.overview.title',
            defaultMessage: 'Overview',
          })}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <a href="/status" target="_blank" rel="noreferrer">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  {intl.formatMessage({
                    id: 'admin.status.overview.viewPublicPage',
                    defaultMessage: 'View public page',
                  })}
                </a>
              </Button>
              {canManage && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin/settings/status">
                    {intl.formatMessage({
                      id: 'admin.status.overview.settings',
                      defaultMessage: 'Settings',
                    })}
                  </Link>
                </Button>
              )}
              {canPublish && (
                <>
                  <ScheduleMaintenanceDialog />
                  <ReportIncidentDialog />
                </>
              )}
            </div>
          }
        />
      </div>

      {data ? (
        <OverviewBody data={data} />
      ) : isError && !isLoading ? (
        // A failed read would otherwise leave the skeleton up for good.
        <EmptyState
          icon={ExclamationTriangleIcon}
          title={intl.formatMessage({
            id: 'admin.status.overview.loadFailedTitle',
            defaultMessage: "Couldn't load the overview",
          })}
          description={intl.formatMessage({
            id: 'admin.status.loadFailedDescription',
            defaultMessage: 'Something went wrong loading it. Check your connection and try again.',
          })}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching
                ? intl.formatMessage({
                    id: 'admin.status.action.retrying',
                    defaultMessage: 'Retrying…',
                  })
                : intl.formatMessage({
                    id: 'common.errorPage.tryAgain',
                    defaultMessage: 'Try again',
                  })}
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <OverviewSkeleton />
      )}
    </div>
  )
}

function OverviewBody({ data }: { data: StatusOverview }) {
  const allComponents = [...data.ungroupedComponents, ...data.groups.flatMap((g) => g.components)]
  const affectedCount = allComponents.filter((c) => c.status !== 'operational').length

  return (
    <div className="p-3 space-y-3">
      {!data.enabled && <DisabledNotice />}
      <PublicStateBanner
        status={data.topLevelStatus as StatusComponentStatus}
        activeCount={data.activeIncidents.length}
        affectedCount={affectedCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3 items-start">
        <div className="space-y-3 min-w-0">
          <ActiveIncidentsCard incidents={data.activeIncidents} />
          <LiveMaintenanceCard windows={data.liveMaintenance} />
          <UpcomingMaintenanceCard windows={data.upcomingMaintenance} />
          <StatTiles data={data} />
        </div>
        <ServiceHealthCard data={data} />
      </div>
    </div>
  )
}

function DisabledNotice() {
  const intl = useOptionalIntl()
  const navigate = useNavigate({ from: Route.fullPath })
  const { canManage } = useStatusAccess()
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 flex items-center gap-3 text-sm">
      <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
      <span className="text-foreground/90">
        {intl.formatMessage({
          id: 'admin.status.overview.disabledNotice',
          defaultMessage: "The status page is turned off, so visitors can't see any of this yet.",
        })}
      </span>
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => void navigate({ to: '/admin/settings/status' })}
        >
          {intl.formatMessage({
            id: 'admin.status.overview.settings',
            defaultMessage: 'Settings',
          })}
        </Button>
      )}
    </div>
  )
}

function PublicStateBanner({
  status,
  activeCount,
  affectedCount,
}: {
  status: StatusComponentStatus
  activeCount: number
  affectedCount: number
}) {
  const intl = useOptionalIntl()
  const hex = COMPONENT_STATUS_COLORS[status]
  const parts: string[] = []
  parts.push(
    activeCount === 0
      ? intl.formatMessage({
          id: 'admin.status.overview.noOpenIncidents',
          defaultMessage: 'No open incidents',
        })
      : intl.formatMessage(
          {
            id: 'admin.status.overview.openIncidentCount',
            defaultMessage: '{count, plural, =1 {1 open incident} other {# open incidents}}',
          },
          { count: activeCount }
        )
  )
  if (affectedCount > 0) {
    parts.push(
      intl.formatMessage(
        {
          id: 'admin.status.overview.servicesAffected',
          defaultMessage: '{count, plural, =1 {1 service affected} other {# services affected}}',
        },
        { count: affectedCount }
      )
    )
  }

  return (
    <div
      className="rounded-xl border px-4 py-4 flex items-center gap-4 flex-wrap"
      style={{ borderColor: `${hex}4d`, backgroundColor: `${hex}12` }}
    >
      <span
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${hex}26` }}
        aria-hidden="true"
      >
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />
      </span>
      <div className="flex-1 min-w-48">
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.status.overview.visitorsSee',
            defaultMessage: 'Visitors currently see',
          })}
        </p>
        <h3 className="text-lg font-semibold leading-tight mt-0.5">
          {intl.formatMessage({
            id: HERO_HEADLINE[status].id,
            defaultMessage: HERO_HEADLINE[status].defaultMessage,
          })}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">{parts.join(' · ')}</p>
      </div>
    </div>
  )
}

function CardShell({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  )
}

function ViewAllLink({
  view,
  label,
}: {
  view: 'open' | 'maintenance' | 'components'
  label?: string
}) {
  const intl = useOptionalIntl()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <button
      type="button"
      onClick={() => void navigate({ to: '/admin/status', search: { view } })}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {label ??
        intl.formatMessage({
          id: 'admin.status.overview.viewAll',
          defaultMessage: 'View all',
        })}
    </button>
  )
}

/** The empty Service health card's one action: the Services page, ready to add. */
function AddServiceButton() {
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <NewButton
      noun="service"
      onClick={() => void navigate({ to: '/admin/status', search: { view: 'components' } })}
    >
      <FormattedMessage id="admin.empty.status.action" defaultMessage="Add a service" />
    </NewButton>
  )
}

function useGoToIncident() {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  return (id: string) => void navigate({ to: '/admin/status', search: { ...search, incident: id } })
}

function ActiveIncidentsCard({ incidents }: { incidents: OverviewIncident[] }) {
  const intl = useOptionalIntl()
  const title = intl.formatMessage({
    id: 'admin.status.overview.openIncidentsCard',
    defaultMessage: 'Open incidents',
  })
  if (incidents.length === 0) {
    return (
      <CardShell title={title}>
        <div className="px-4 py-5 flex items-center gap-2.5 text-sm text-muted-foreground">
          <CheckCircleIcon className="h-5 w-5 text-success" />
          {intl.formatMessage({
            id: 'admin.status.overview.noOpenIncidents',
            defaultMessage: 'No open incidents',
          })}
        </div>
      </CardShell>
    )
  }

  return (
    <CardShell title={title} action={<ViewAllLink view="open" />}>
      <div className="divide-y divide-border/40">
        {incidents.map((incident) => (
          <LiveRow
            key={incident.id}
            item={incident}
            meta={
              <Badge variant="outline" size="sm">
                {intl.formatMessage({
                  id: IMPACT_LABEL[incident.impact].id,
                  defaultMessage: IMPACT_LABEL[incident.impact].defaultMessage,
                })}
              </Badge>
            }
          />
        ))}
      </div>
    </CardShell>
  )
}

/** Windows running now. They are live, like an open incident, so they read
 *  like one: when they started and the latest update, with Post update to
 *  hand. Nothing shows while none is running. */
function LiveMaintenanceCard({ windows }: { windows: OverviewIncident[] }) {
  const intl = useOptionalIntl()
  const formatDate = useLocalDateFormatter()
  if (windows.length === 0) return null

  return (
    <CardShell
      title={intl.formatMessage({
        id: 'admin.status.overview.maintenanceInProgress',
        defaultMessage: 'Maintenance in progress',
      })}
      action={<ViewAllLink view="maintenance" />}
    >
      <div className="divide-y divide-border/40">
        {windows.map((w) => (
          <LiveRow
            key={w.id}
            item={w}
            meta={
              w.scheduledStartAt ? (
                <span>
                  {intl.formatMessage(
                    {
                      id: 'admin.status.overview.planned',
                      defaultMessage: 'Planned {window}',
                    },
                    {
                      window: formatWindow(intl, formatDate, w.scheduledStartAt, w.scheduledEndAt),
                    }
                  )}
                </span>
              ) : null
            }
          />
        ))}
      </div>
    </CardShell>
  )
}

/** One live incident or running window: what it is, when it started, the
 *  latest update, and Post update. */
function LiveRow({ item, meta }: { item: OverviewIncident; meta?: React.ReactNode }) {
  const intl = useOptionalIntl()
  const goToIncident = useGoToIncident()
  const latest = item.updates[item.updates.length - 1]
  const lifecycle = item.status as StatusIncidentLifecycle
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: IMPACT_COLORS[item.impact] }}
        />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="font-semibold text-sm text-left hover:underline underline-offset-2 line-clamp-1"
            onClick={() => goToIncident(item.id)}
          >
            {item.title}
          </button>
          <div className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground mt-1">
            <LifecycleBadge status={lifecycle} />
            {meta}
            {item.affectedComponents.slice(0, 3).map((c) => (
              <span key={c.componentId}>{c.name}</span>
            ))}
            <span className="text-muted-foreground/50">·</span>
            <FormattedMessage
              id="admin.status.overview.started"
              defaultMessage="Started {time}"
              values={{ time: <TimeAgo date={item.startedAt} /> }}
            />
          </div>
        </div>
        <Button size="sm" onClick={() => goToIncident(item.id)}>
          {intl.formatMessage({
            id: 'admin.status.action.postUpdate',
            defaultMessage: 'Post update',
          })}
        </Button>
      </div>
      {latest && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2.5 ml-1 line-clamp-2">
          <span className="text-foreground/80 font-medium">
            <FormattedMessage
              id="admin.status.overview.latestUpdate"
              defaultMessage="Latest update {time}:"
              values={{ time: <TimeAgo date={latest.createdAt} /> }}
            />
          </span>{' '}
          {latest.body}
        </p>
      )}
    </div>
  )
}

function formatWindow(
  intl: IntlShape,
  format: LocalDateFormatter,
  startIso: string | null,
  endIso: string | null
): string {
  if (!startIso)
    return intl.formatMessage({
      id: 'admin.status.overview.notScheduled',
      defaultMessage: 'Not scheduled',
    })
  const day = format(startIso, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = (iso: string) => format(iso, { hour: '2-digit', minute: '2-digit' })
  return endIso
    ? intl.formatMessage(
        {
          id: 'admin.status.overview.windowRange',
          defaultMessage: '{start} to {end}',
        },
        { start: `${day}, ${time(startIso)}`, end: time(endIso) }
      )
    : `${day}, ${time(startIso)}`
}

/** The day of the month as plain digits ("2", never "2."), in the formatter's zone. */
function dayOfMonth(format: LocalDateFormatter, date: Date): string {
  return format(date, { day: 'numeric', numberingSystem: 'latn' }).replace(/\D/g, '')
}

/** Windows still ahead. One that has started is under Maintenance in
 *  progress instead. */
function UpcomingMaintenanceCard({ windows }: { windows: OverviewIncident[] }) {
  const intl = useOptionalIntl()
  const formatDate = useLocalDateFormatter()
  const goToIncident = useGoToIncident()
  const startMutation = useStartStatusMaintenanceNow()
  const [startTarget, setStartTarget] = useState<OverviewIncident | null>(null)

  if (windows.length === 0) return null

  return (
    <>
      <CardShell
        title={intl.formatMessage({
          id: 'admin.status.overview.upcomingMaintenance',
          defaultMessage: 'Upcoming maintenance',
        })}
        action={<ViewAllLink view="maintenance" />}
      >
        <div className="divide-y divide-border/40">
          {windows.map((w) => {
            const start = w.scheduledStartAt ? new Date(w.scheduledStartAt) : null
            const lifecycle = w.status as StatusIncidentLifecycle
            return (
              <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-11 shrink-0 rounded-lg border border-border/60 text-center overflow-hidden">
                  <div className="text-[11px] font-medium bg-muted text-muted-foreground py-0.5">
                    {start ? formatDate(start, { month: 'short' }) : '-'}
                  </div>
                  <div className="text-base font-semibold py-0.5 tabular-nums">
                    {start ? dayOfMonth(formatDate, start) : '?'}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="font-semibold text-sm text-left hover:underline underline-offset-2 line-clamp-1"
                    onClick={() => goToIncident(w.id)}
                  >
                    {w.title}
                  </button>
                  <div className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground mt-1">
                    <LifecycleBadge status={lifecycle} />
                    <span>
                      {formatWindow(intl, formatDate, w.scheduledStartAt, w.scheduledEndAt)}
                    </span>
                    {w.autoStart && (
                      <Badge variant="outline" size="sm">
                        {intl.formatMessage({
                          id: 'admin.status.overview.autoStartBadge',
                          defaultMessage: 'Auto-start',
                        })}
                      </Badge>
                    )}
                    {w.autoComplete && (
                      <Badge variant="outline" size="sm">
                        {intl.formatMessage({
                          id: 'admin.status.overview.autoCompleteBadge',
                          defaultMessage: 'Auto-complete',
                        })}
                      </Badge>
                    )}
                  </div>
                </div>
                {w.status === 'scheduled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStartTarget(w)}
                    disabled={startMutation.isPending}
                  >
                    {intl.formatMessage({
                      id: 'admin.status.overview.startNow',
                      defaultMessage: 'Start now',
                    })}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => goToIncident(w.id)}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </CardShell>

      <ConfirmDialog
        open={!!startTarget}
        onOpenChange={(o) => !o && setStartTarget(null)}
        title={intl.formatMessage({
          id: 'admin.status.overview.startConfirmTitle',
          defaultMessage: 'Start maintenance now?',
        })}
        description={intl.formatMessage({
          id: 'admin.status.overview.startConfirmDescription',
          defaultMessage:
            'The window begins immediately: affected services switch to Under maintenance on the public page and an update is posted to the timeline. Subscribers are not emailed.',
        })}
        confirmLabel={intl.formatMessage({
          id: 'admin.status.overview.startNow',
          defaultMessage: 'Start now',
        })}
        isPending={startMutation.isPending}
        onConfirm={() => {
          if (!startTarget) return
          startMutation.mutate(startTarget.id, {
            onSuccess: () => {
              setStartTarget(null)
              toast.success(
                intl.formatMessage({
                  id: 'admin.status.overview.toastStarted',
                  defaultMessage: 'Maintenance started',
                })
              )
            },
            onError: (err) =>
              toastError(
                err,
                intl.formatMessage({
                  id: 'admin.status.overview.toastStartFailed',
                  defaultMessage: 'Failed to start maintenance',
                })
              ),
          })
        }}
      />
    </>
  )
}

function StatTiles({ data }: { data: StatusOverview }) {
  const intl = useOptionalIntl()
  const formatNumber = useFormatNumber()
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <AnalyticsStatRow
        stats={[
          {
            label: intl.formatMessage({
              id: 'admin.status.overview.uptime90d',
              defaultMessage: '90-day uptime',
            }),
            value: data.uptime90d === null ? '-' : `${data.uptime90d.toFixed(2)}%`,
          },
          {
            label: intl.formatMessage({
              id: 'admin.status.overview.subscribers',
              defaultMessage: 'Subscribers',
            }),
            value: formatNumber(data.subscribers.active),
            caption:
              data.subscribers.newLast7d > 0
                ? intl.formatMessage(
                    {
                      id: 'admin.status.overview.newThisWeek',
                      defaultMessage: '+{count} this week',
                    },
                    { count: data.subscribers.newLast7d }
                  )
                : undefined,
          },
          {
            label: intl.formatMessage({
              id: 'admin.status.overview.incidents30d',
              defaultMessage: 'Incidents, 30 days',
            }),
            value: String(data.incidentsLast30d),
          },
        ]}
      />
    </div>
  )
}

function ServiceHealthCard({ data }: { data: StatusOverview }) {
  const intl = useOptionalIntl()
  // Services are managed on a page only status_page.manage can open.
  const { canManage } = useStatusAccess()
  // A group with no services has nothing to report, so it is not listed.
  const groups = data.groups.filter((g) => g.components.length > 0)
  const hasAny = data.ungroupedComponents.length > 0 || groups.length > 0

  return (
    <CardShell
      title={intl.formatMessage({
        id: 'admin.status.overview.serviceHealth',
        defaultMessage: 'Service health',
      })}
      action={
        canManage ? (
          <ViewAllLink
            view="components"
            label={intl.formatMessage({
              id: 'admin.status.overview.manage',
              defaultMessage: 'Manage',
            })}
          />
        ) : undefined
      }
    >
      {!hasAny ? (
        <div className="space-y-3 px-4 py-5">
          <div className="text-sm font-medium">
            <FormattedMessage id="admin.empty.status.title" defaultMessage="No services yet" />
          </div>
          {canManage && <AddServiceButton />}
        </div>
      ) : (
        <div>
          {data.ungroupedComponents.map((c) => (
            <ServiceRow key={c.id} name={c.name} status={c.status as StatusComponentStatus} />
          ))}
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-4 py-1.5 text-[13px] font-medium text-muted-foreground bg-muted/40 border-t border-border/40">
                {g.name}
              </div>
              {g.components.map((c) => (
                <ServiceRow key={c.id} name={c.name} status={c.status as StatusComponentStatus} />
              ))}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

function ServiceRow({ name, status }: { name: string; status: StatusComponentStatus }) {
  const intl = useOptionalIntl()
  return (
    <div className="px-4 py-2 flex items-center gap-2.5 text-sm border-t border-border/30 first:border-t-0">
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: COMPONENT_STATUS_COLORS[status] }}
      />
      <span className="truncate">{name}</span>
      <span
        className="ml-auto text-xs font-medium shrink-0"
        style={{ color: COMPONENT_STATUS_COLORS[status] }}
      >
        {intl.formatMessage({
          id: COMPONENT_STATUS_LABEL[status].id,
          defaultMessage: COMPONENT_STATUS_LABEL[status].defaultMessage,
        })}
      </span>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="p-3 space-y-3">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
