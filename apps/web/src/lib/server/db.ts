/**
 * Core database connection for the web app.
 *
 * This module contains the actual database initialization and connection logic.
 * This is the canonical location for database imports.
 *
 * @example
 * import { db, eq, and, posts } from '@/lib/server/db'
 */

import { createDb, type Database as PostgresDatabase } from '@quackback/db/client'
import { config } from '@/lib/server/config'
import { wrapDbTransaction } from '@/lib/server/jobs/after-commit'
import { countingQueryLogger } from '@/lib/server/request-metrics'

// Import drizzle-orm operators explicitly to work around Nitro bundler issues
// with nested barrel exports. If we use `export { asc } from 'drizzle-orm'`,
// the bundler may create export objects that reference `asc` without importing it.
import {
  eq as _eq,
  and as _and,
  or as _or,
  ne as _ne,
  gt as _gt,
  gte as _gte,
  lt as _lt,
  lte as _lte,
  like as _like,
  ilike as _ilike,
  inArray as _inArray,
  notInArray as _notInArray,
  isNull as _isNull,
  isNotNull as _isNotNull,
  exists as _exists,
  notExists as _notExists,
  sql as _sql,
  desc as _desc,
  asc as _asc,
  count as _count,
  sum as _sum,
  avg as _avg,
  min as _min,
  max as _max,
} from 'drizzle-orm'

// Re-export with original names
export const eq = _eq
export const and = _and
export const or = _or
export const ne = _ne
export const gt = _gt
export const gte = _gte
export const lt = _lt
export const lte = _lte
export const like = _like
export const ilike = _ilike
export const inArray = _inArray
export const notInArray = _notInArray
export const isNull = _isNull
export const isNotNull = _isNotNull
export const exists = _exists
export const notExists = _notExists
export const sql = _sql
export const desc = _desc
export const asc = _asc
export const count = _count
export const sum = _sum
export const avg = _avg
export const min = _min
export const max = _max

// Database type - postgres.js for self-hosted
export type Database = PostgresDatabase
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

// Use globalThis to persist database instance across hot reloads in development
declare global {
  var __db: PostgresDatabase | undefined
}

/**
 * The process's database, from `DATABASE_URL`.
 *
 * Memoized on `globalThis` so a development reload does not open a second pool.
 */
function getDatabase(): Database {
  if (!globalThis.__db) {
    globalThis.__db = createDb(config.databaseUrl, {
      max: config.dbPoolMax,
      idleTimeout: config.dbIdleTimeout,
      logger: countingQueryLogger,
    })
  }
  return globalThis.__db
}

/**
 * Database instance.
 *
 * A Proxy, so the 500-odd importing files never learn that the handle is
 * resolved lazily. The trap resolves the memoized handle on every property
 * access, so a module imported before `DATABASE_URL` is readable still works.
 *
 * Functions are bound to the handle they came from and `Reflect.get` is given
 * that same handle as the receiver, so getters resolve against the real object
 * rather than the proxy.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const database = getDatabase()
    const value = Reflect.get(database as object, prop, database)
    if (typeof value !== 'function') return value
    const bound = value.bind(database)
    // Every domain transaction participates in after-commit signalling. Nested
    // calls are savepoints; only the outer commit flushes.
    if (prop === 'transaction') return wrapDbTransaction(bound)
    return bound
  },
})

// Re-export everything from the db package
// Note: We explicitly import and re-export drizzle-orm operators here
// because Nitro's bundler has issues with nested barrel exports (export *)
// that can cause "X is not defined" errors at runtime.
export {
  // Schema tables - auth
  account,
  accountRelations,
  accountProfileSync,
  invitation,
  invitationRelations,
  jwks,
  oauthAccessToken,
  oauthAccessTokenRelations,
  oauthClient,
  oauthClientRelations,
  oauthClientAssertion,
  deviceCode,
  oauthClientResource,
  oauthClientResourceRelations,
  oauthConsent,
  oauthConsentRelations,
  oauthRefreshToken,
  oauthRefreshTokenRelations,
  oauthResource,
  oauthResourceRelations,
  principal,
  principalRelations,
  oneTimeToken,
  session,
  sessionRelations,
  settings,
  settingsRelations,
  identityProvider,
  ssoVerifiedDomain,
  twoFactor,
  user,
  userRelations,
  verification,
  // Schema tables - boards
  boards,
  boardsRelations,
  roadmaps,
  roadmapsRelations,
  roadmapColumns,
  roadmapColumnsRelations,
  postTags,
  postTagsRelations,
  // Schema tables - statuses
  DEFAULT_STATUSES,
  postStatuses,
  postStatusesRelations,
  STATUS_CATEGORIES,
  // Schema tables - posts
  postCommentEditHistory,
  commentEditHistoryRelations,
  postCommentReactions,
  commentReactionsRelations,
  postComments,
  postCommentsRelations,
  postEditHistory,
  postEditHistoryRelations,
  postMentions,
  postMentionsRelations,
  postNotes,
  postNotesRelations,
  posts,
  postsRelations,
  postTagAssignments,
  postTagAssignmentsRelations,
  postVotes,
  postVotesRelations,
  // Schema tables - teams
  teams,
  teamsRelations,
  teamMembers,
  teamMembersRelations,
  // Schema tables - tickets (support platform §4.2)
  tickets,
  ticketsRelations,
  ticketStatuses,
  ticketStatusesRelations,
  ticketTypes,
  ticketConversations,
  ticketConversationsRelations,
  ticketLinks,
  ticketLinksRelations,
  ticketActivity,
  ticketActivityRelations,
  ticketSubscriptions,
  ticketSubscriptionsRelations,
  DEFAULT_TICKET_STATUSES,
  // Schema tables - email channel (support platform §4.8)
  channelAccounts,
  channelThreads,
  emailSendingDomains,
  emailSesTenants,
  emailSenders,
  EMAIL_SENDER_SURFACES,
  // Schema tables - office hours + SLA (support platform §4.6)
  officeHoursSchedules,
  slaPolicies,
  slaEvents,
  // Schema tables - integrations
  integrationEventMappings,
  integrationEventMappingsRelations,
  integrationPlatformCredentials,
  integrationPlatformCredentialsRelations,
  integrations,
  integrationsRelations,
  // Schema tables - external links
  postExternalLinks,
  postExternalLinksRelations,
  ticketExternalLinks,
  ticketExternalLinksRelations,
  // Schema tables - import runs (imports & exports hub)
  importRuns,
  importRunsRelations,
  // Schema tables - export runs (workspace data export)
  exportRuns,
  exportRunsRelations,
  // Schema tables - changelog
  changelogEntries,
  changelogEntriesRelations,
  changelogEntryPosts,
  changelogEntryPostsRelations,
  changelogCategories,
  changelogCategoriesRelations,
  changelogEntryCategories,
  changelogEntryCategoriesRelations,
  changelogSubscriptions,
  changelogSubscriptionsRelations,
  // Schema tables - conversations
  conversations,
  conversationsRelations,
  conversationMessages,
  conversationMessagesRelations,
  conversationTags,
  conversationTagsRelations,
  conversationTagAssignments,
  conversationTagAssignmentsRelations,
  conversationParticipants,
  conversationMessageMentions,
  conversationMessageMentionsRelations,
  conversationMessageReactions,
  conversationMessageReactionsRelations,
  conversationMessageFlags,
  conversationMessageFlagsRelations,
  // Schema tables - past-conversation summaries (Quinn grounding, P2-A.4)
  // Schema tables - closed-ticket resolution summaries (Quinn grounding, Phase 4)
  // Schema tables - custom saved inbox views + per-user pins
  conversationViews,
  conversationViewPins,
  // Schema tables - saved feedback-inbox views
  postViews,
  // Schema tables - conversation attribute definitions
  conversationAttributeDefinitions,
  type ConversationAttributeFieldType,
  type ConversationAttributeOption,
  type ConversationAttributeSourceHint,
  // Schema tables - channel identities + outbound-email threading
  channelIdentities,
  conversationOutboundEmails,
  // Schema tables - macros (canned replies + bundled actions)
  macros,
  // Schema tables - notifications
  inAppNotifications,
  inAppNotificationsRelations,
  notificationPreferences,
  notificationPreferencesRelations,
  postSubscriptions,
  postSubscriptionsRelations,
  unsubscribeTokens,
  onboardingEmails,
  unsubscribeTokensRelations,
  // Schema tables - sentiment
  // Schema tables - api keys
  apiKeys,
  apiKeysRelations,
  // Schema tables - webhooks
  webhooks,
  webhooksRelations,
  // Schema tables - hook delivery idempotency
  hookDeliveries,
  // Schema tables - durable event outbox (EVENTING-V2 spine)
  events,
  // Schema tables - audit log
  auditLog,
  RESTORE_SETTLEMENT_AUDIT_EVENT,
  // Schema tables - sso recovery codes
  ssoRecoveryCode,
  // Schema tables - segments
  segments,
  segmentsRelations,
  userSegments,
  userSegmentsRelations,
  type SegmentRules,
  type SegmentCondition,
  type SegmentRuleOperator,
  type SegmentRuleAttribute,
  type EvaluationSchedule,
  type SegmentWeightConfig,
  type UserAttributeDefinition,
  type UserAttributeType,
  type CurrencyCode,
  // Schema tables - user attributes
  userAttributeDefinitions,
  // Schema tables - user tags
  userTags,
  userTagsRelations,
  userTagAssignments,
  userTagAssignmentsRelations,
  // Schema tables - merge suggestions
  // Schema tables - activity
  postActivity,
  postActivityRelations,
  // Schema tables - ai usage log
  emailLog,
  // Schema tables - analytics
  analyticsDailyStats,
  analyticsTopPosts,
  // Schema tables - visitor analytics
  pageViews,
  visitorStatsDaily,
  visitorTopStats,
  visitorDevices,
  VISITOR_SURFACES,
  VISITOR_TOP_DIMENSIONS,
  ensurePageViewPartitions,
  dropExpiredPageViewPartitions,
  refreshVisitorAnalytics,
  VISITOR_PERIODS,
  // Schema tables - help center
  helpCenterCategories,
  helpCenterCategoriesRelations,
  helpCenterArticles,
  helpCenterArticlesRelations,
  helpCenterArticleFeedback,
  helpCenterArticleFeedbackRelations,
  helpCenterRedirectRules,
  helpCenterArticleTranslations,
  helpCenterArticleTranslationsRelations,
  helpCenterCategoryTranslations,
  helpCenterCategoryTranslationsRelations,
  helpCenterSearchQueries,
  LOCALE_TO_REGCONFIG,
  regconfigForLocale,
  // Schema tables - status page
  statusComponentGroups,
  statusComponentGroupsRelations,
  statusComponents,
  statusComponentsRelations,
  statusComponentEvents,
  statusComponentEventsRelations,
  statusIncidents,
  statusIncidentsRelations,
  statusIncidentUpdates,
  statusIncidentUpdatesRelations,
  statusIncidentComponents,
  statusIncidentComponentsRelations,
  statusSubscriptions,
  statusSubscriptionsRelations,
  statusIncidentTemplates,
  files,
  filesRelations,
  // Schema tables - assistant web sources
  // Schema tables - assistant pending actions
  APPROVAL_RISKS,
  APPROVAL_REQUEST_CHANNELS,
  APPROVAL_DECISION_CHANNELS,
  APPROVAL_EXECUTION_STATES,
  type ApprovalRisk,
  type ApprovalRequestChannel,
  type ApprovalDecisionChannel,
  type ApprovalExecutionState,
  // Schema tables - assistant tool-call audit log
  // Retired assistant tables are no longer exported.
  slackUserLinks,
  integrationDeliveries,
  integrationSyncOperations,
  integrationSyncAttempts,
  integrationSyncActions,
  // Schema tables - RBAC
  roles,
  permissions,
  rolePermissions,
  principalRoleAssignments,
  // RBAC permission catalogue (the code-authoritative contract)
  PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSION_CATALOGUE,
  PERMISSION_CATEGORIES,
  WORKSPACE_ADMIN_PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_DEFS,
  SYSTEM_ROLE_PERMISSIONS,
  presetForLegacyRole,
  // Client-safe permissions mirror renderer (pure; used by the drift test)
  renderPermissionsMirror,
  // Migration ledger status (readiness probe)
  getMigrationStatus,
  // System-data reconcile (integration tests exercise the assignment heal)
  seedSystemData,
  // Types/constants
  REACTION_EMOJIS,
  USE_CASE_TYPES,
  // Test-customer identity kept out of every metric
  isTestPrincipalSql,
  notTestPrincipal,
  notTestConversation,
  notTestTicket,
} from '@quackback/db'

// Background index list and builder, for the deferred-index-build job.
export {
  DEFERRED_INDEX_SPECS,
  ensureConcurrentIndexes,
  type ConcurrentIndexSpec,
} from '@quackback/db/schema-ops'

// Re-export schema types not covered by @quackback/db/types
export type { MacroScope, MacroPriority, MacroSnoozePreset, MacroAction } from '@quackback/db'
export type { ServiceMetadata } from '@quackback/db'
export type { FileRecord, NewFileRecord } from '@quackback/db'
export type { IdentityProviderClaimMapping, ClaimRoleMapping } from '@quackback/db'
export type { PermissionKey, PermissionCategory, SystemRoleKey } from '@quackback/db'
export type {
  ChannelAccount,
  EmailSendingDomain,
  EmailSesTenant,
  EmailSender,
  EmailSenderSurface,
  EmailSenderMode,
  ChannelAccountConfig,
  SendingDomainDnsRecord,
  SendingDomainOwnershipRecord,
  SendingDomainKeyRecord,
  SendingDomainProofRecord,
  SendingDomainDkimMode,
  SendingDomainRecordCheck,
  SendingDomainPreflight,
} from '@quackback/db'
export type { OfficeHoursSchedule, OfficeHoursInterval } from '@quackback/db'
export type { ChangelogSubscriptionSource } from '@quackback/db'
export type { TicketSubscriptionReason } from '@quackback/db'
export type {
  StatusComponentStatus,
  StatusIncidentStatus,
  StatusMaintenanceStatus,
  StatusIncidentKind,
  StatusIncidentImpact,
  StatusComponentEventSource,
  StatusSubscriptionScope,
  StatusSubscriptionSource,
} from '@quackback/db'
export type { SlaPolicy, SlaEvent } from '@quackback/db'
export type {
  ImportRunSource,
  ImportRunStatus,
  ImportRunTotals,
  ImportRunErrorEntry,
} from '@quackback/db'
export type { ExportRunStatus, ExportRunEntityCounts } from '@quackback/db'

// Re-export types (for client components that need types without side effects)
export * from '@quackback/db/types'
