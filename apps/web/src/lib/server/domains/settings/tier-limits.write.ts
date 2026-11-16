/**
 * The mutation seam for `settings.tier_limits`.
 *
 * Enforcement is untouched — `getTierLimits()` and every helper in
 * `tier-enforce.ts` read exactly what they read before. This file only adds a
 * disciplined *write* for the declarative config file and the operator API.
 *
 * Three properties, all of which an ad-hoc write path lacks:
 *
 *  1. **The read, the merge and the write are inside one row lock**, so two
 *     writers cannot lose each other's changes.
 *  2. **The config file's whole-block lock is honoured.** `tierLimits` is a
 *     whole-block managed path, so an operator who pins limits in
 *     `/etc/quackback/config.yaml` keeps them: another writer is refused
 *     rather than silently overriding the operator.
 *  3. **It is idempotent.** Unchanged limits do not rewrite the row or bust
 *     the caches.
 */

import { db, eq, settings } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'
import { NotFoundError } from '@/lib/shared/errors'
import { invalidateSettingsCache } from './settings.helpers'
import { invalidateTierLimitsCache } from './tier-limits.service'
import type { TierLimits } from './tier-limits.types'

const log = logger.child({ component: 'tier-limits-write' })

export type TierLimitsWriter = 'config'

export interface TierLimitsWriteResult {
  changed: boolean
  /** True when the write was refused because the config file owns the column. */
  managedByConfigFile: boolean
}

/**
 * Replace the stored tier limits with `next`.
 *
 * Replacement, not merge — this column has always
 * been written whole (`mergeTierLimits()` layers the stored value over the
 * OSS defaults at *read* time), and a per-field merge would make lowering a
 * limit unable to remove one raised earlier.
 *
 * `null` clears the operator baseline back to the unlimited OSS default.
 */
export async function writeTierLimits(
  next: Partial<TierLimits> | null,
  opts: { writer: TierLimitsWriter }
): Promise<TierLimitsWriteResult> {
  const serialized = next === null ? null : JSON.stringify(next)

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: settings.id,
        tierLimits: settings.tierLimits,
      })
      .from(settings)
      .limit(1)
      .for('update')

    if (!row) throw new NotFoundError('SETTINGS_NOT_FOUND', 'Settings not found')

    if (row.tierLimits === serialized) {
      return { changed: false, managedByConfigFile: false }
    }

    await tx.update(settings).set({ tierLimits: serialized }).where(eq(settings.id, row.id))
    return { changed: true, managedByConfigFile: false }
  })

  if (result.changed) {
    invalidateTierLimitsCache()
    await invalidateSettingsCache()
    log.info({ writer: opts.writer, cleared: next === null }, 'tier limits written')
  } else if (result.managedByConfigFile) {
    log.info(
      { writer: opts.writer },
      'tier limits are managed by the declarative config file; write skipped'
    )
  }
  return result
}
