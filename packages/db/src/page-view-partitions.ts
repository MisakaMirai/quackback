/**
 * Day-partition maintenance for the page_views table.
 *
 * The table is declaratively range-partitioned by occurred_at. A daily job
 * calls ensurePageViewPartitions (pre-create a window ahead) and
 * dropExpiredPageViewPartitions (instant, bloat-free retention: dropping a
 * whole day partition replaces a mass DELETE). All date arithmetic runs on
 * the database clock (current_date), the same source the 0137 migration
 * used, so partition bounds stay aligned regardless of app-host timezones.
 */
import { sql } from 'drizzle-orm'
import type { Database } from './client'

const PARTITION_NAME = /^page_views_(\d{8})$/

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Create day partitions from yesterday through `daysAhead` days out. Idempotent. */
export async function ensurePageViewPartitions(
  db: Database,
  opts?: { daysAhead?: number }
): Promise<void> {
  const daysAhead = clampInt(opts?.daysAhead ?? 7, 1, 60)
  await db.execute(
    sql.raw(`DO $$
DECLARE
	d date;
BEGIN
	FOR i IN -1..${daysAhead} LOOP
		d := current_date + i;
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF "page_views" FOR VALUES FROM (%L) TO (%L)',
			'page_views_' || to_char(d, 'YYYYMMDD'),
			d,
			d + 1
		);
	END LOOP;
END $$;`)
  )
}

/**
 * Whether an insert failure is the "no partition for this row" case: the day
 * partition covering `occurred_at` does not exist yet (maintenance has not run,
 * or the clock crossed midnight). SQLSTATE 23514 with the parent's name in the
 * message; anything else is not healed by creating a partition.
 */
export function isMissingPageViewPartition(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = (error as { message?: unknown }).message
  return (
    code === '23514' &&
    typeof message === 'string' &&
    message.includes('no partition of relation') &&
    message.includes('page_views')
  )
}

/** Postgres reports a concurrent `CREATE TABLE IF NOT EXISTS` losing the race as a duplicate-table error. */
function isDuplicateTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === '42P07' || code === '23505'
}

/**
 * Create the day partition covering the database's current date (the insert
 * default for `occurred_at`), so one late/missing-partition beacon is stored
 * instead of being dropped. Idempotent; a concurrent creator losing the race is
 * treated as success. On a one-connection pool this runs after the failed
 * insert's own statement, never inside its transaction, so it takes the same
 * connection rather than requesting a second one.
 */
export async function ensurePageViewPartitionForToday(db: Database): Promise<void> {
  try {
    await db.execute(
      sql.raw(`DO $$
DECLARE
	d date := current_date;
BEGIN
	EXECUTE format(
		'CREATE TABLE IF NOT EXISTS %I PARTITION OF "page_views" FOR VALUES FROM (%L) TO (%L)',
		'page_views_' || to_char(d, 'YYYYMMDD'),
		d,
		d + 1
	);
END $$;`)
    )
  } catch (error) {
    if (isDuplicateTable(error)) return
    throw error
  }
}

/**
 * Drop day partitions older than the retention window. Returns the dropped
 * partition names. Rollup tables are unaffected — they carry no identifiers
 * and are kept indefinitely.
 */
export async function dropExpiredPageViewPartitions(
  db: Database,
  opts?: { retentionDays?: number }
): Promise<string[]> {
  const retentionDays = clampInt(opts?.retentionDays ?? 90, 1, 3650)

  const cutoffResult = await db.execute(
    sql`SELECT to_char(current_date - ${retentionDays}::int, 'YYYYMMDD') AS cutoff`
  )
  const [{ cutoff }] = Array.from(cutoffResult as Iterable<{ cutoff: string }>)

  const partitionsResult = await db.execute(
    sql`SELECT c.relname AS relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'page_views'::regclass`
  )
  const partitions = Array.from(partitionsResult as Iterable<{ relname: string }>)

  const dropped: string[] = []
  for (const { relname } of partitions) {
    const match = PARTITION_NAME.exec(relname)
    if (!match || match[1] >= cutoff) continue
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${relname}"`))
    dropped.push(relname)
  }
  return dropped
}
