import { describe, it, expect, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Database } from '../client'
import {
  ensurePageViewPartitions,
  ensurePageViewPartitionForToday,
  isMissingPageViewPartition,
  dropExpiredPageViewPartitions,
} from '../page-view-partitions'

// DB-backed (skips without Postgres, like the 0126 backfill pin). Requires the
// 0137 page_views parent table (run `bun run db:migrate` against quackback_test).
const DB_URL = process.env.DATABASE_URL
let db: Database | null = null
if (DB_URL) db = createDb(DB_URL, { max: 1 })

const OLD_PARTITION = 'page_views_20200101'

async function listPartitions(database: Database): Promise<string[]> {
  const rows = await database.execute(
    sql`SELECT c.relname AS relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'page_views'::regclass`
  )
  return Array.from(rows as Iterable<{ relname: string }>).map((r) => r.relname)
}

afterAll(async () => {
  if (!db) return
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "${OLD_PARTITION}"`))
  // @ts-expect-error optional teardown
  await db?.$client?.end?.()
})

describe('isMissingPageViewPartition', () => {
  it('recognizes the no-partition check violation for page_views', () => {
    const error = Object.assign(new Error('no partition of relation "page_views" found for row'), {
      code: '23514',
    })
    expect(isMissingPageViewPartition(error)).toBe(true)
  })

  it('rejects unrelated errors', () => {
    expect(isMissingPageViewPartition(new Error('no partition of relation "other"'))).toBe(false)
    expect(
      isMissingPageViewPartition(
        Object.assign(new Error('no partition of relation "page_views"'), { code: '42P01' })
      )
    ).toBe(false)
    expect(isMissingPageViewPartition(null)).toBe(false)
  })
})

describe.skipIf(!DB_URL)('page_views partition maintenance', () => {
  it('ensures a contiguous window ahead and is idempotent', async () => {
    if (!db) return
    await ensurePageViewPartitions(db, { daysAhead: 8 })
    await ensurePageViewPartitions(db, { daysAhead: 8 })

    const expected = await db.execute(
      sql`SELECT 'page_views_' || to_char(current_date + 8, 'YYYYMMDD') AS name`
    )
    const [{ name }] = Array.from(expected as Iterable<{ name: string }>)
    expect(await listPartitions(db)).toContain(name)
  })

  it('drops partitions past retention but keeps recent ones', async () => {
    if (!db) return
    await db.execute(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS "${OLD_PARTITION}" PARTITION OF "page_views" FOR VALUES FROM ('2020-01-01') TO ('2020-01-02')`
      )
    )

    const dropped = await dropExpiredPageViewPartitions(db, { retentionDays: 90 })

    expect(dropped).toContain(OLD_PARTITION)
    const remaining = await listPartitions(db)
    expect(remaining).not.toContain(OLD_PARTITION)

    const today = await db.execute(
      sql`SELECT 'page_views_' || to_char(current_date, 'YYYYMMDD') AS name`
    )
    const [{ name: todayName }] = Array.from(today as Iterable<{ name: string }>)
    expect(remaining).toContain(todayName)
  })

  it('creates the partition for today on demand, idempotently', async () => {
    if (!db) return
    const today = await db.execute(
      sql`SELECT 'page_views_' || to_char(current_date, 'YYYYMMDD') AS name`
    )
    const [{ name }] = Array.from(today as Iterable<{ name: string }>)

    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${name}"`))
    expect(await listPartitions(db)).not.toContain(name)

    await ensurePageViewPartitionForToday(db)
    await ensurePageViewPartitionForToday(db)

    expect(await listPartitions(db)).toContain(name)
  })

  it('ignores unrelated tables when pruning', async () => {
    if (!db) return
    const dropped = await dropExpiredPageViewPartitions(db, { retentionDays: 90 })
    for (const name of dropped) {
      expect(name).toMatch(/^page_views_\d{8}$/)
    }
  })
})
