/**
 * The application cache, on Postgres.
 *
 * Successor to `lib/server/redis.ts`'s `cacheGet`/`cacheSet`/`cacheDel`.
 * The call sites are unchanged: same three helpers, same key table, same
 * "a cache failure is a cache miss" contract. What changed is where a row
 * lands — `kv_store` in the install's own database instead of a key in Redis.
 *
 * ## Failures are swallowed, deliberately
 *
 * Every helper below logs and continues. That was already true of the Redis
 * version and the callers depend on it — `settings.service.ts` reads through
 * this on the SSR hot path and must not 500 because a cache is unavailable.
 * A cache call from a background context that has no database yet degrades to a
 * miss, which is the correct direction: a miss is slow, an error is an outage.
 */
import { logger } from '@/lib/server/logger'
import { kvGet, kvSet, kvDel } from '@/lib/server/kv/pg-kv'
import { forgetCachedKeys } from '@/lib/server/local-cache'

const log = logger.child({ component: 'cache' })

/**
 * Logical cache key names.
 *
 * These are the strings that reach the `key` column verbatim. Half of them are
 * built by concatenation at the call site (`PRINCIPAL_BY_USER`, the SSO-test
 * session keys, the link-preview and unfurl keys), which is safe because the
 * key column is the whole identity of a row: one install, one row per key.
 */
export const CACHE_KEYS = {
  WORKSPACE_SETTINGS: 'settings:workspace',
  INTEGRATION_MAPPINGS: 'hooks:integration-mappings',
  // v2 invalidates rows cached before migration 0123 added the
  // conversation.csat_comment_added subscription.
  ACTIVE_WEBHOOKS: 'hooks:webhooks-active:v2',
  SLACK_CHANNELS: 'slack:channels',
  // Hot dependency of getWorkspaceSettings; invalidated by save/delete in
  // platform-credential.service.ts.
  PLATFORM_INTEGRATION_TYPES: 'platform-cred:configured-types',
  // The registered-auth-provider id list surfaced to the login UI on every
  // app bootstrap. Derived from identity_provider + sso_verified_domain +
  // authConfig.oauth; invalidated by invalidateSettingsCache() and by the
  // platform-credential save/delete flows. 5min TTL backstops anything missed.
  REGISTERED_AUTH_PROVIDERS: 'auth:registered-providers',
  // Names a user's principal. Nothing is stored under it: the principal row is
  // read once per request (`auth/request-session.ts`) under this same key, and
  // every role/type mutation deletes the key, which drops that memo.
  PRINCIPAL_BY_USER: (userId: string) => `principal:user:${userId}` as const,
} as const

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await kvGet<T>(key)
  } catch (err) {
    log.warn({ err, key }, 'cache get failed')
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await kvSet(key, value, ttlSeconds)
  } catch (err) {
    log.warn({ err, key }, 'cache set failed')
  }
}

/**
 * Delete `keys`, and forget every copy of them this process holds: the
 * request memo and the short-lived local copies (`local-cache.ts`).
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  forgetCachedKeys(...keys)
  try {
    await kvDel(...keys)
  } catch (err) {
    log.warn({ err, keys }, 'cache del failed')
  }
}
