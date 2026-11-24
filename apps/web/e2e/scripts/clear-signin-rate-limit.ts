/**
 * CLI: clear the magic-link sign-in rate-limit buckets.
 *
 * Repeated e2e runs from one machine hit the per-IP magic-link limiter
 * (keys `signin:magiclink:*`), which then 429s the sign-in POST and fails
 * every spec that authenticates a portal user. Run this before specs that
 * request magic links.
 *
 * The buckets are rows in `rate_bucket`, keyed by the same logical name the
 * limiter uses (`auth/signin-rate-limit.ts`), so the prefix match below is the
 * direct successor of the key scan this used to do over the wire.
 *
 * Usage: bun clear-signin-rate-limit.ts
 */
import { openDb } from './_lib'

/**
 * `ip-only` clears just the per-address budget, leaving the 3-per-(ip,address)
 * one intact. A spec that asserts the per-address window's exact shape needs
 * that: the 20-per-15-minutes per-IP budget is shared by everything the shard
 * signed in, and resetting it is not part of what the spec is measuring.
 */
const ipOnly = (process.argv[2] || '').toLowerCase() === 'ip-only'

const sql = openDb()

try {
  const rows = ipOnly
    ? await sql`
        DELETE FROM rate_bucket WHERE key LIKE 'signin:magiclink:ip:%' RETURNING key`
    : await sql`
        DELETE FROM rate_bucket WHERE key LIKE 'signin:magiclink:%' RETURNING key`
  console.log(JSON.stringify({ deleted: rows.length }))
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
} finally {
  await sql.end()
}
