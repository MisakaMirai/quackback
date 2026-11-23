/**
 * Space reclamation for the tables that replaced Redis.
 *
 * **This is not what makes expiry correct.** Every read in `pg-kv.ts`,
 * `realtime/presence.ts` and `realtime/pubsub.ts` filters on `expires_at >
 * now()` (or a heartbeat cutoff), so an expired row is invisible the instant it
 * expires whether or not this has ever run. Redis deleted a key when its TTL
 * elapsed and callers depended on that deletion; here the predicate is the
 * guarantee and this is only the vacuum behind it.
 *
 * That distinction matters because it decides what a missed sweep costs: disk,
 * not correctness. A sweeper that were load-bearing would make every one of
 * these stores wrong for as long as a worker tier was down.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/server/db'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'
import { PRESENCE_TTL_SECONDS } from '@/lib/server/realtime/presence'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'kv-sweep' })

export interface KvSweepResult {
  kvStore: number
  rateBucket: number
  setMembers: number
  presence: number
  overflow: number
}

function deleted(result: unknown): number {
  return getExecuteRows<{ id: unknown }>(result).length
}

/** Delete every expired row. */
export async function sweepExpiredKv(): Promise<KvSweepResult> {
  const result: KvSweepResult = {
    kvStore: deleted(
      await db.execute(sql`DELETE FROM kv_store WHERE expires_at <= now() RETURNING key AS id`)
    ),
    rateBucket: deleted(
      await db.execute(
        sql`DELETE FROM rate_bucket WHERE window_expires_at <= now() RETURNING key AS id`
      )
    ),
    setMembers: deleted(
      await db.execute(
        sql`DELETE FROM kv_set_member WHERE expires_at <= now() RETURNING member AS id`
      )
    ),
    presence: deleted(
      await db.execute(sql`
        DELETE FROM presence_stream
        WHERE heartbeat_at <= now() - make_interval(secs => ${PRESENCE_TTL_SECONDS})
        RETURNING stream_id AS id
      `)
    ),
    overflow: deleted(
      await db.execute(sql`DELETE FROM realtime_overflow WHERE expires_at <= now() RETURNING id`)
    ),
  }
  const total =
    result.kvStore + result.rateBucket + result.setMembers + result.presence + result.overflow
  if (total > 0) log.info({ ...result }, 'expired store rows reclaimed')
  return result
}
