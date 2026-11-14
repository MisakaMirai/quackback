import { db, settings } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'
import { WorkspaceKeyedCache } from '@/lib/server/workspaces/workspace-keyed'
import { OSS_TIER_LIMITS, type TierLimits } from './tier-limits.types'

const log = logger.child({ component: 'tier-limits-service' })

type StoredTierLimits = Partial<Omit<TierLimits, 'features'>> & {
  features?: Partial<TierLimits['features']>
}

/**
 * Parse stored `tier_limits` JSON, tolerating corruption. Absent is the
 * documented "no row" state (self-hosters get {@link OSS_TIER_LIMITS}).
 * Unparseable or non-object JSON is corrupt data: logged once so it can be
 * found and repaired, and treated the same as "no row" rather than throwing on
 * every tier-limit check.
 */
function parseStoredTierLimits(raw: string | null | undefined): StoredTierLimits | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    log.error(
      { err, column: 'tier_limits' },
      'unreadable tier_limits JSON, treating as no stored row'
    )
    return null
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.error(
      { column: 'tier_limits', valueType: Array.isArray(parsed) ? 'array' : typeof parsed },
      'tier_limits JSON was not an object, treating as no stored row'
    )
    return null
  }

  return parsed as StoredTierLimits
}

export function mergeTierLimits(stored: StoredTierLimits | null): TierLimits {
  if (!stored) return OSS_TIER_LIMITS
  return {
    ...OSS_TIER_LIMITS,
    ...stored,
    features: {
      ...OSS_TIER_LIMITS.features,
      ...(stored.features ?? {}),
    },
  }
}

/**
 * Resolve the active TierLimits for this workspace. Installs with no row in
 * `settings.tier_limits` get OSS_TIER_LIMITS (unlimited everything); an
 * operator-written row caps whatever it names.
 */
export function resolveEffectiveTierLimits(stored: StoredTierLimits | null): TierLimits {
  return mergeTierLimits(stored)
}

/** Per workspace: the limits are that workspace's own operator row. */
interface CachedLimits {
  stored: StoredTierLimits | null
}

const cachedLimits = new WorkspaceKeyedCache<CachedLimits>()
const LIMITS_KEY = 'limits'

export async function getTierLimits(): Promise<TierLimits> {
  let cached = cachedLimits.get(LIMITS_KEY)

  if (!cached) {
    const rows = await db.select({ tierLimits: settings.tierLimits }).from(settings).limit(1)
    cached = { stored: parseStoredTierLimits(rows[0]?.tierLimits) }
    cachedLimits.set(LIMITS_KEY, cached)
  }

  return resolveEffectiveTierLimits(cached.stored)
}

/** Invalidate the active workspace's cache. Call when settings.tier_limits is written. */
export function invalidateTierLimitsCache(): void {
  cachedLimits.delete(LIMITS_KEY)
}
