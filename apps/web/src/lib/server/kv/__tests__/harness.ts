/**
 * Real-Postgres harness for the KV / presence / realtime suites.
 *
 * These substrates replaced Redis, and the properties that matter about them —
 * atomicity under concurrency and TTL semantics — are properties of *statements
 * executing against a real server*. A fake `db` would let every one of these
 * suites pass while the shipped SQL was wrong.
 *
 * **Every key is unique per test.** `DATABASE_URL` is hard-coded to one shared
 * `quackback_test` for every worktree and agent on the machine, so a suite that
 * asserted whole-table state would fail on somebody else's row. Nothing here
 * counts rows it did not write.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
// The lint rule reserves @quackback/db/client for db.ts; test fixtures that
// need their own short-lived connection are sanctioned callers, same as
// db-test-fixture.ts and jobs/__tests__/harness.ts.
// oxlint-disable-next-line no-restricted-imports
import { createDbFromSql, type Database } from '@quackback/db/client'
import { seedTestConfigEnv } from '@/lib/server/__tests__/test-env'

const URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/quackback_test'

// The code under test reaches the database through the app's `db`, which loads
// the validated config.
seedTestConfigEnv()
process.env.DATABASE_URL = process.env.DATABASE_URL || URL

const MIGRATION = path.resolve(
  __dirname,
  '../../../../../../../packages/db/drizzle/0251_pg_kv_presence_realtime.sql'
)

let sqlHandle: postgres.Sql | null = null
let dbHandle: Database | null = null

export function testSql(): postgres.Sql {
  if (!sqlHandle) sqlHandle = postgres(URL, { max: 8, onnotice: () => {} })
  return sqlHandle
}

export function testDb(): Database {
  if (!dbHandle) dbHandle = createDbFromSql(testSql())
  return dbHandle
}

/**
 * Ensure the tables exist, by executing the shipped migration file rather than a
 * paraphrase of it. If the two ever diverge, these suites are testing something
 * that does not ship.
 */
export async function ensureKvSchema(): Promise<void> {
  const sql = testSql()
  const [{ ready }] = await sql<{ ready: boolean }[]>`
    SELECT (
      to_regclass('public.kv_store') IS NOT NULL
      AND to_regclass('public.rate_bucket') IS NOT NULL
      AND to_regclass('public.kv_set_member') IS NOT NULL
      AND to_regclass('public.presence_stream') IS NOT NULL
      AND to_regclass('public.realtime_overflow') IS NOT NULL
    ) AS ready
  `
  if (ready) return
  await sql.unsafe(readFileSync(MIGRATION, 'utf8'))
}

/** A key nothing else on this machine can collide with. */
export function uniqueKey(prefix: string): string {
  return `${prefix}:${randomUUID()}`
}

/**
 * Run against the real test database. One install is one namespace, so the
 * argument only tags this suite's rows; there is no scope to open.
 */
export function withRealWorkspace<T>(_installKey: string, fn: () => Promise<T>): Promise<T> {
  return fn()
}

/** A unique run token, for tests that need two distinct principals. */
export function workspacePair(): [string, string] {
  const run = randomUUID().slice(0, 8)
  return [`kvt-a-${run}`, `kvt-b-${run}`]
}

/** Reclaim the expired rows these suites leave behind. Never deletes live rows. */
export async function cleanupWorkspaces(..._installKeys: string[]): Promise<void> {
  await cleanupExpired()
}

/** Reclaim the expired rows these suites leave behind. Never deletes live rows. */
export async function cleanupExpired(): Promise<void> {
  const sql = testSql()
  await sql`DELETE FROM kv_store WHERE expires_at <= now()`
  await sql`DELETE FROM rate_bucket WHERE window_expires_at <= now()`
  await sql`DELETE FROM kv_set_member WHERE expires_at <= now()`
  await sql`DELETE FROM realtime_overflow WHERE expires_at <= now()`
}

export async function closeHarness(): Promise<void> {
  if (sqlHandle) await sqlHandle.end({ timeout: 5 }).catch(() => {})
  sqlHandle = null
  dbHandle = null
}
