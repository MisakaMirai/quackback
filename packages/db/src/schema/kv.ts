/**
 * Redis's application half, as tables in the install's database.
 *
 * One install is one workspace, so a key names exactly one row. The
 * statements that read these tables live in `apps/web/src/lib/server/kv/` and
 * `apps/web/src/lib/server/realtime/`, written as raw SQL rather than through
 * the query builder: each one is a single atomic upsert whose CASE arms carry
 * the TTL semantics, and spelling that in a builder would hide the part that
 * has to be read carefully.
 */
import {
  pgTable,
  text,
  jsonb,
  integer,
  boolean,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/** Generic cache entries, SET-NX locks and single values. */
export const kvStore = pgTable(
  'kv_store',
  {
    /** Logical key, exactly as the caller named it. Never prefixed again. */
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    /** Reads filter on this; the sweeper only reclaims space. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('kv_store_expires_at_idx').on(t.expiresAt)]
)

/** Fixed-window rate-limit counters. */
export const rateBucket = pgTable(
  'rate_bucket',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_bucket_window_expires_at_idx').on(t.windowExpiresAt)]
)

/** Members of a keyed set — today only `user:devices:v3:<userId>`. */
export const kvSetMember = pgTable(
  'kv_set_member',
  {
    setKey: text('set_key').notNull(),
    member: text('member').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ name: 'kv_set_member_pkey', columns: [t.setKey, t.member] }),
    index('kv_set_member_expires_at_idx').on(t.expiresAt),
  ]
)

/** One row per live SSE stream. `isAgent` replaces Redis's second agents set. */
export const presenceStream = pgTable(
  'presence_stream',
  {
    principalId: text('principal_id').notNull(),
    streamId: text('stream_id').notNull(),
    isAgent: boolean('is_agent').notNull().default(false),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'presence_stream_pkey', columns: [t.principalId, t.streamId] }),
    index('presence_stream_heartbeat_idx').on(t.heartbeatAt),
    // Serves `listOnlineAgentIds()` / `isAnyAgentAvailable()`:
    // `WHERE is_agent AND heartbeat_at > now() - interval`.
    index('presence_stream_agents_idx')
      .on(t.heartbeatAt)
      .where(sql`is_agent`),
  ]
)

/** Realtime payloads too large for a `pg_notify` payload (8000 bytes). */
export const realtimeOverflow = pgTable(
  'realtime_overflow',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    channel: text('channel').notNull(),
    payload: jsonb('payload').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('realtime_overflow_expires_at_idx').on(t.expiresAt)]
)
