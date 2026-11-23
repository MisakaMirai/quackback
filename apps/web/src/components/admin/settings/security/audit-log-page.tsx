/**
 * Admin audit-log feed. Renders a paginated table of recent security-
 * sensitive actions with filters (event type, outcome, time range)
 * and a CSV export of the currently-filtered window.
 */
import { useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useDebouncedValue } from '@/lib/client/hooks/use-debounced-value'
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useLocalDateFormatter } from '@/components/ui/local-date'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { adminQueries } from '@/lib/client/queries/admin'
import type { AuditEventRow } from '@/lib/server/functions/audit-log'
import type { AuditChannel } from '@/lib/shared/audit-attribution'

/**
 * Event-type catalog for the filter dropdown. Mirrors the
 * AuditEventType union, sourced from the server to keep the two in
 * lockstep would be neat, but a curated short list is friendlier for
 * the dropdown.
 *
 * Shape: `{ label, value, group?, excludeByDefault? }`. Items without a
 * `group` appear at the top (ungrouped). `excludeByDefault` marks high-
 * volume events that should not be shown on initial load; honored by any
 * future multi-select variant of this filter.
 */
interface FilterEventOption {
  label: MessageDescriptor
  value: string
  group?: MessageDescriptor
  excludeByDefault?: boolean
}

const EVENT_TYPE_MESSAGES = defineMessages({
  all: {
    id: 'admin.settings.security.audit.events.all',
    defaultMessage: 'All events',
  },
  ssoEnforcementDomainEnabled: {
    id: 'admin.settings.security.audit.events.ssoEnforcementDomainEnabled',
    defaultMessage: 'SSO enforcement enabled (domain)',
  },
  ssoEnforcementDomainDisabled: {
    id: 'admin.settings.security.audit.events.ssoEnforcementDomainDisabled',
    defaultMessage: 'SSO enforcement disabled (domain)',
  },
  ssoConfigChanged: {
    id: 'admin.settings.security.audit.events.ssoConfigChanged',
    defaultMessage: 'SSO config changed',
  },
  passwordEnabled: {
    id: 'admin.settings.security.audit.events.passwordEnabled',
    defaultMessage: 'Password sign-in enabled',
  },
  passwordDisabled: {
    id: 'admin.settings.security.audit.events.passwordDisabled',
    defaultMessage: 'Password sign-in disabled',
  },
  emailEnabled: {
    id: 'admin.settings.security.audit.events.emailEnabled',
    defaultMessage: 'Email sign-in enabled',
  },
  emailDisabled: {
    id: 'admin.settings.security.audit.events.emailDisabled',
    defaultMessage: 'Email sign-in disabled',
  },
  twoFactorResetByAdmin: {
    id: 'admin.settings.security.audit.events.twoFactorResetByAdmin',
    defaultMessage: 'Two-factor reset by admin',
  },
  restoreSettled: {
    id: 'admin.settings.security.audit.events.restoreSettled',
    defaultMessage: 'Restore: external side effects settled',
  },
  portalAllowedDomainsChanged: {
    id: 'admin.settings.security.audit.events.portalAllowedDomainsChanged',
    defaultMessage: 'Allowed domains changed',
  },
  portalAllowedSegmentsChanged: {
    id: 'admin.settings.security.audit.events.portalAllowedSegmentsChanged',
    defaultMessage: 'Allowed segments changed',
  },
  portalAccessDenied: {
    id: 'admin.settings.security.audit.events.portalAccessDenied',
    defaultMessage: 'Access denied',
  },
  portalInviteAccepted: {
    id: 'admin.settings.security.audit.events.portalInviteAccepted',
    defaultMessage: 'Invite accepted',
  },
  portalInviteResent: {
    id: 'admin.settings.security.audit.events.portalInviteResent',
    defaultMessage: 'Invite resent',
  },
  portalInviteLinkMinted: {
    id: 'admin.settings.security.audit.events.portalInviteLinkMinted',
    defaultMessage: 'Invite link minted',
  },
  portalInviteSent: {
    id: 'admin.settings.security.audit.events.portalInviteSent',
    defaultMessage: 'Invite sent',
  },
  portalSignInFailed: {
    id: 'admin.settings.security.audit.events.portalSignInFailed',
    defaultMessage: 'Sign-in failed',
  },
  portalVisibilityChanged: {
    id: 'admin.settings.security.audit.events.portalVisibilityChanged',
    defaultMessage: 'Visibility changed',
  },
  labsExperimentChanged: {
    id: 'admin.settings.security.audit.events.labsExperimentChanged',
    defaultMessage: 'Experiment changed',
  },
  apiWrite: {
    id: 'admin.settings.security.audit.events.apiWrite',
    defaultMessage: 'API write',
  },
  apiImport: {
    id: 'admin.settings.security.audit.events.apiImport',
    defaultMessage: 'API import',
  },
  mcpToolCall: {
    id: 'admin.settings.security.audit.events.mcpToolCall',
    defaultMessage: 'MCP tool call',
  },
  settingsApplied: {
    id: 'admin.settings.security.audit.events.settingsApplied',
    defaultMessage: 'Settings applied',
  },
  settingsUndone: {
    id: 'admin.settings.security.audit.events.settingsUndone',
    defaultMessage: 'Settings undone',
  },
})

const EVENT_GROUP_MESSAGES = defineMessages({
  portal: { id: 'admin.settings.security.audit.groups.portal', defaultMessage: 'Portal' },
  labs: { id: 'admin.settings.security.audit.groups.labs', defaultMessage: 'Labs' },
  apiAndMcp: {
    id: 'admin.settings.security.audit.groups.apiAndMcp',
    defaultMessage: 'API and MCP',
  },
  settings: {
    id: 'admin.settings.security.audit.groups.settings',
    defaultMessage: 'Settings',
  },
})

const FILTER_EVENT_TYPES: FilterEventOption[] = [
  { label: EVENT_TYPE_MESSAGES.all, value: 'all' },
  {
    label: EVENT_TYPE_MESSAGES.ssoEnforcementDomainEnabled,
    value: 'sso.enforcement.domain.enabled',
  },
  {
    label: EVENT_TYPE_MESSAGES.ssoEnforcementDomainDisabled,
    value: 'sso.enforcement.domain.disabled',
  },
  { label: EVENT_TYPE_MESSAGES.ssoConfigChanged, value: 'sso.config.changed' },
  { label: EVENT_TYPE_MESSAGES.passwordEnabled, value: 'auth.password.enabled' },
  { label: EVENT_TYPE_MESSAGES.passwordDisabled, value: 'auth.password.disabled' },
  { label: EVENT_TYPE_MESSAGES.emailEnabled, value: 'auth.magic_link.enabled' },
  { label: EVENT_TYPE_MESSAGES.emailDisabled, value: 'auth.magic_link.disabled' },
  { label: EVENT_TYPE_MESSAGES.twoFactorResetByAdmin, value: 'two_factor.reset_by_admin' },
  { label: EVENT_TYPE_MESSAGES.restoreSettled, value: 'restore.side_effects_settled' },
  // Portal events
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalAllowedDomainsChanged,
    value: 'portal.allowed_domains.changed',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalAllowedSegmentsChanged,
    value: 'portal.allowed_segments.changed',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalAccessDenied,
    value: 'portal.access.denied',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalInviteAccepted,
    value: 'portal.invite.accepted',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: {
      id: 'portal.invite.expired.title',
      defaultMessage: 'Invite expired',
    },
    value: 'portal.invite.expired',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalInviteLinkMinted,
    value: 'portal.invite.link_minted',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalInviteResent,
    value: 'portal.invite.resent',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: {
      id: 'portal.invite.revoked.title',
      defaultMessage: 'Invite revoked',
    },
    value: 'portal.invite.revoked',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalInviteSent,
    value: 'portal.invite.sent',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalSignInFailed,
    value: 'auth.signin.failed',
  },
  {
    group: EVENT_GROUP_MESSAGES.portal,
    label: EVENT_TYPE_MESSAGES.portalVisibilityChanged,
    value: 'portal.visibility.changed',
  },
  {
    group: EVENT_GROUP_MESSAGES.labs,
    label: EVENT_TYPE_MESSAGES.labsExperimentChanged,
    value: 'labs.experiment.changed',
  },
  // Changes made with an API key or an MCP client, recorded at the boundary.
  {
    group: EVENT_GROUP_MESSAGES.apiAndMcp,
    label: EVENT_TYPE_MESSAGES.apiWrite,
    value: 'api.write',
  },
  {
    group: EVENT_GROUP_MESSAGES.apiAndMcp,
    label: EVENT_TYPE_MESSAGES.apiImport,
    value: 'api.import',
  },
  {
    group: EVENT_GROUP_MESSAGES.apiAndMcp,
    label: EVENT_TYPE_MESSAGES.mcpToolCall,
    value: 'mcp.tool_call',
  },
  {
    group: EVENT_GROUP_MESSAGES.settings,
    label: EVENT_TYPE_MESSAGES.settingsApplied,
    value: 'settings.applied',
  },
  {
    group: EVENT_GROUP_MESSAGES.settings,
    label: EVENT_TYPE_MESSAGES.settingsUndone,
    value: 'settings.undone',
  },
]

const TIME_RANGES = [
  {
    label: {
      id: 'portal.feedback.filter.date.last7Days',
      defaultMessage: 'Last 7 days',
    },
    value: '7d',
  },
  {
    label: {
      id: 'portal.feedback.filter.date.last30Days',
      defaultMessage: 'Last 30 days',
    },
    value: '30d',
  },
  {
    label: {
      id: 'portal.feedback.filter.date.last90Days',
      defaultMessage: 'Last 90 days',
    },
    value: '90d',
  },
  {
    label: {
      id: 'admin.settings.security.audit.range.allTime',
      defaultMessage: 'All time',
    },
    value: 'all',
  },
] as const

type TimeRange = (typeof TIME_RANGES)[number]['value']

/**
 * Convert the time-range pick to a stable ISO timestamp. Stable in
 * two senses: (1) rounded to the start of the current minute so two
 * calls within 60s produce the same string, which keeps the loader
 * prefetch and the component's mount call landing on the same React
 * Query cache entry; (2) idempotent for repeated calls with the same
 * range in the same minute.
 */
export function rangeToFromIso(range: TimeRange): string | undefined {
  if (range === 'all') return undefined
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  // Floor to the minute so SSR + hydrate land on the same query key.
  const minuteMs = 60 * 1000
  const now = Math.floor(Date.now() / minuteMs) * minuteMs
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
}

// A stamp reads "May 13" and "12:48 AM", with the year in its title.
// audit-log retention caps at 365 days by default so every row is within the
// current year.
const STAMP_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const STAMP_TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
const STAMP_FULL: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

/**
 * Two-line timestamp: "May 13" above "12:48 AM", in the viewer's zone once
 * hydrated. Keeps the When column narrow without forcing the date string to
 * wrap mid-word when the table is squeezed by long target IDs.
 */
function StackedTimestamp({ iso }: { iso: string }) {
  const format = useLocalDateFormatter('en-US')
  return (
    <div className="flex flex-col leading-tight" title={format(iso, STAMP_FULL)}>
      <span>{format(iso, STAMP_DATE)}</span>
      <span className="text-xs">{format(iso, STAMP_TIME)}</span>
    </div>
  )
}

/** One-line timestamp for the stacked mobile rows: "May 13 12:48 AM". */
function InlineTimestamp({ iso }: { iso: string }) {
  const format = useLocalDateFormatter('en-US')
  return (
    <span title={format(iso, STAMP_FULL)}>
      {format(iso, STAMP_DATE)} {format(iso, STAMP_TIME)}
    </span>
  )
}

/**
 * Render the audit-log query result as CSV.
 *
 * Exported for testability, the CSV is the operator's primary
 * offline-forensics tool, so the column set is worth pinning with
 * unit tests rather than only exercising via the click path.
 */
export function rowsToCsv(rows: AuditEventRow[]): string {
  const headers = [
    'occurred_at',
    'event_type',
    'outcome',
    'actor_email',
    'actor_role',
    'actor_type',
    'auth_method',
    'actor_ip',
    'target_type',
    'target_id',
    'request_id',
    'metadata',
    'channel',
    'credential_kind',
    'credential_id',
    'client_name',
    'on_behalf_of_principal_id',
    'on_behalf_of',
  ]
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    let s = typeof v === 'string' ? v : JSON.stringify(v)
    // A spreadsheet runs a cell that starts like a formula. Several columns
    // carry text the actor chose (client names, emails), so a leading quote
    // keeps every such cell text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.occurredAt,
        r.eventType,
        r.eventOutcome,
        r.actorEmail,
        r.actorRole,
        r.actorType,
        r.authMethod,
        r.actorIp,
        r.targetType,
        r.targetId,
        r.requestId,
        r.metadata,
        r.channel,
        r.credentialKind,
        r.credentialId,
        viaClientName(r),
        r.onBehalfOfPrincipalId,
        r.onBehalfOfName,
      ]
        .map(escape)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

const VIA_CHANNEL: Partial<Record<AuditChannel, MessageDescriptor>> = defineMessages({
  api: { id: 'admin.auditLog.via.api', defaultMessage: 'via API' },
  mcp: { id: 'admin.auditLog.via.mcp', defaultMessage: 'via MCP' },
  workflow: { id: 'admin.auditLog.via.workflow', defaultMessage: 'via workflow' },
  system: { id: 'admin.auditLog.via.system', defaultMessage: 'via system' },
})

const VIA_ON_BEHALF_OF = defineMessages({
  onBehalfOf: { id: 'admin.auditLog.via.onBehalfOf', defaultMessage: 'for {name}' },
}).onBehalfOf

function viaClientName(row: { channel: AuditChannel | null; clientName: string | null }) {
  return row.clientName
}

/**
 * How a change that did not come from someone using the app arrived, and for
 * whom: "via MCP · Claude Desktop for James Morton". Null for a change made in
 * the app, and for a row with no attribution, so the normal row stays quiet.
 */
export function attributionLine(
  row: { channel: AuditChannel | null; clientName: string | null; onBehalfOfName: string | null },
  intl: Pick<IntlShape, 'formatMessage'>
): string | null {
  // `ui` has no line, and neither does a channel this build does not know.
  const channel = row.channel ? VIA_CHANNEL[row.channel] : undefined
  if (!channel) return null
  const via = [intl.formatMessage(channel), viaClientName(row)].filter(Boolean).join(' · ')
  if (!row.onBehalfOfName) return via
  return `${via} ${intl.formatMessage(VIA_ON_BEHALF_OF, { name: row.onBehalfOfName })}`
}

/**
 * The via line with the credential id after it, for the tooltip: a client
 * names itself, so two with look-alike names are told apart by their ids.
 */
export function attributionTooltip(
  row: {
    channel: AuditChannel | null
    clientName: string | null
    onBehalfOfName: string | null
    credentialId: string | null
  },
  intl: Pick<IntlShape, 'formatMessage'>
): string | null {
  const line = attributionLine(row, intl)
  if (!line) return null
  return row.credentialId ? `${line} (${row.credentialId})` : line
}

function ViaLine({ row }: { row: AuditEventRow }) {
  const intl = useOptionalIntl()
  const line = attributionLine(row, intl)
  if (!line) return null
  return (
    <span
      className="truncate text-xs text-muted-foreground"
      title={attributionTooltip(row, intl) ?? undefined}
    >
      {line}
    </span>
  )
}

function ActorCell({ row }: { row: AuditEventRow }) {
  // Anonymous + service principals don't have an email, fall back to
  // actorType so the row is never blank. This is the in-table
  // surface for the 0070_audit_log_observability migration's
  // actorType + authMethod columns; request_id stays in the CSV.
  const intl = useOptionalIntl()
  const primary = row.actorEmail ?? (row.actorType ? `(${row.actorType})` : null)
  if (!primary) {
    return (
      <span className="text-muted-foreground">
        {intl.formatMessage({ id: 'common.none', defaultMessage: 'None' })}
      </span>
    )
  }
  const role = row.actorRole ? row.actorRole.charAt(0).toUpperCase() + row.actorRole.slice(1) : null
  const subtitle = [role, row.authMethod].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col">
      <span className="truncate">{primary}</span>
      {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      <ViaLine row={row} />
    </div>
  )
}

/**
 * Target cell: the type sits on the top line as a label and the ID
 * goes on a second line in monospace, truncated with a tooltip for
 * the full value. Stacking is what stops the long
 * `domain_01krf77nfbf23v3dmx5ztdjkzr` string from blowing out the
 * row width.
 */
function TargetCell({ row }: { row: AuditEventRow }) {
  const intl = useOptionalIntl()
  if (!row.targetType) {
    return (
      <span className="text-muted-foreground">
        {intl.formatMessage({ id: 'common.none', defaultMessage: 'None' })}
      </span>
    )
  }
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {row.targetType}
      </span>
      {row.targetId ? (
        <span className="truncate font-mono text-[11px]" title={row.targetId}>
          {row.targetId}
        </span>
      ) : null}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: AuditEventRow['eventOutcome'] }) {
  return (
    <Badge variant={outcome === 'success' ? 'secondary' : 'destructive'} className="text-xs">
      {outcome}
    </Badge>
  )
}

function downloadCsv(rows: AuditEventRow[]): void {
  const csv = rowsToCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function AuditLogPage() {
  const intl = useOptionalIntl()
  const [eventType, setEventType] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [actorEmailInput, setActorEmailInput] = useState<string>('')

  // Debounce so each keystroke doesn't fire a fresh server-fn request.
  // 300ms feels instant without spamming.
  const debouncedActorEmail = useDebouncedValue(actorEmailInput, 300)

  // High-volume events are hidden from the "All events" view by default.
  // admins who want to see them pick the specific event type from the
  // dropdown. No separate toggle: the dropdown selection already says
  // exactly what the admin wants to see.
  const defaultExcludedEventTypes = useMemo(
    () => FILTER_EVENT_TYPES.filter((o) => o.excludeByDefault).map((o) => o.value),
    []
  )

  const excludeEventTypes = useMemo(
    () => (eventType === 'all' ? defaultExcludedEventTypes : []),
    [eventType, defaultExcludedEventTypes]
  )

  const filters = useMemo(
    () => ({
      eventType: eventType === 'all' ? undefined : eventType,
      actorEmail: debouncedActorEmail.trim() || undefined,
      from: rangeToFromIso(timeRange),
      limit: 200,
      excludeEventTypes: excludeEventTypes.length > 0 ? excludeEventTypes : undefined,
    }),
    [eventType, timeRange, debouncedActorEmail, excludeEventTypes]
  )

  const { data } = useSuspenseQuery(adminQueries.auditEvents(filters))
  const rows = data.events

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger size="sm" className="w-full sm:w-64">
              <SelectValue
                placeholder={intl.formatMessage({
                  id: 'admin.settings.security.audit.filter.eventType',
                  defaultMessage: 'Event type',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {/* Ungrouped items first */}
              {FILTER_EVENT_TYPES.filter((o) => !o.group).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {intl.formatMessage(opt.label)}
                </SelectItem>
              ))}
              {/* Grouped items */}
              {Array.from(
                new Set(FILTER_EVENT_TYPES.filter((o) => !!o.group).map((o) => o.group!))
              ).map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel className="text-muted-foreground px-2 py-1">
                    {intl.formatMessage(group)}
                  </SelectLabel>
                  {FILTER_EVENT_TYPES.filter((o) => o.group === group).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {intl.formatMessage(opt.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger size="sm" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {intl.formatMessage(opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="search"
            placeholder={intl.formatMessage({
              id: 'admin.settings.security.audit.filter.actorEmailPlaceholder',
              defaultMessage: 'Filter by actor email',
            })}
            value={actorEmailInput}
            onChange={(e) => setActorEmailInput(e.target.value)}
            className="h-9 w-full sm:w-56 text-xs"
            aria-label={intl.formatMessage({
              id: 'admin.settings.security.audit.filter.actorEmailAria',
              defaultMessage: 'Filter audit events by actor email',
            })}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(rows)}
          disabled={rows.length === 0}
          className="h-9"
        >
          <ArrowDownTrayIcon className="size-3.5" />
          {intl.formatMessage({
            id: 'admin.settings.security.audit.exportCsv',
            defaultMessage: 'Export CSV',
          })}
        </Button>
      </div>

      {/* md+: horizontal-scrolling fixed-width table. `overflow-x-auto`
       *  lets the table scroll rather than wrapping cells into
       *  single-word columns. `table-fixed` + explicit widths give the
       *  browser stable layout targets. */}
      <div className="hidden md:block overflow-x-auto rounded-md border">
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[7rem]">
                {intl.formatMessage({
                  id: 'admin.settings.security.audit.table.when',
                  defaultMessage: 'When',
                })}
              </TableHead>
              <TableHead className="w-[18rem]">
                {intl.formatMessage({
                  id: 'admin.settings.security.audit.table.event',
                  defaultMessage: 'Event',
                })}
              </TableHead>
              <TableHead className="w-[16rem]">
                {intl.formatMessage({
                  id: 'admin.settings.security.audit.table.actor',
                  defaultMessage: 'Actor',
                })}
              </TableHead>
              <TableHead className="w-[18rem]">
                {intl.formatMessage({
                  id: 'admin.settings.security.audit.table.target',
                  defaultMessage: 'Target',
                })}
              </TableHead>
              <TableHead className="w-[5rem]">
                {intl.formatMessage({
                  id: 'admin.settings.security.audit.table.outcome',
                  defaultMessage: 'Outcome',
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {intl.formatMessage({
                    id: 'admin.settings.security.audit.empty',
                    defaultMessage: 'No audit events match these filters yet.',
                  })}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <StackedTimestamp iso={row.occurredAt} />
                    </TableCell>
                    <TableCell className="truncate font-mono" title={row.eventType}>
                      {row.eventType}
                    </TableCell>
                    <TableCell className="truncate">
                      <ActorCell row={row} />
                    </TableCell>
                    <TableCell>
                      <TargetCell row={row} />
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={row.eventOutcome} />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* below md: stacked event cards */}
      <div className="md:hidden rounded-md border divide-y divide-border">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.security.audit.empty',
              defaultMessage: 'No audit events match these filters yet.',
            })}
          </p>
        ) : (
          rows.map((row) => {
            return (
              <div key={row.id} className="p-3 space-y-2">
                {/* Primary: event type + outcome */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="font-mono text-xs truncate text-foreground"
                    title={row.eventType}
                  >
                    {row.eventType}
                  </span>
                  <OutcomeBadge outcome={row.eventOutcome} />
                </div>
                {/* Secondary fields */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 font-medium text-foreground/60">
                      {intl.formatMessage({
                        id: 'admin.settings.security.audit.table.when',
                        defaultMessage: 'When',
                      })}
                    </span>
                    <InlineTimestamp iso={row.occurredAt} />
                  </div>
                  {row.actorEmail || attributionLine(row, intl) ? (
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 font-medium text-foreground/60">
                        {intl.formatMessage({
                          id: 'admin.settings.security.audit.table.actor',
                          defaultMessage: 'Actor',
                        })}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {row.actorEmail ?? (row.actorType ? `(${row.actorType})` : null)}
                        </span>
                        <ViaLine row={row} />
                      </div>
                    </div>
                  ) : null}
                  {row.targetType && (
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 font-medium text-foreground/60">
                        {intl.formatMessage({
                          id: 'admin.settings.security.audit.table.target',
                          defaultMessage: 'Target',
                        })}
                      </span>
                      <div className="min-w-0">
                        <span className="uppercase tracking-wide text-xs">{row.targetType}</span>
                        {row.targetId && (
                          <p className="font-mono text-[11px] truncate" title={row.targetId}>
                            {row.targetId}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {data.hasMore ? (
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage(
            {
              id: 'admin.settings.security.audit.more',
              defaultMessage:
                'Showing the most recent {count, plural, one {# event} other {# events}}. Narrow the filters to see older entries.',
            },
            { count: rows.length }
          )}
        </p>
      ) : null}
    </div>
  )
}
