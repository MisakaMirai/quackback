/**
 * Whether the install's database has applied a bundled migration.
 *
 * One process serves one database, so this reads the local Drizzle ledger. The
 * backfill scheduler uses it to wait for a schema change instead of running
 * ahead of it.
 */
import type { Sql } from 'postgres'
import {
  BUNDLED_MIGRATIONS,
  readAppliedLedger,
  type LedgerReader,
} from '@quackback/db/schema-version'

export async function migrationAppliedIn(reader: LedgerReader, tag: string): Promise<boolean> {
  const migration = BUNDLED_MIGRATIONS.find((m) => m.tag === tag)
  if (!migration) throw new Error(`"${tag}" is not a migration this build bundles`)
  return (await readAppliedLedger(reader)).versions.has(migration.when)
}

/** Convenience overload for the app's database handle. */
export function migrationAppliedFor(db: Sql, tag: string): Promise<boolean> {
  return migrationAppliedIn(db as unknown as LedgerReader, tag)
}
