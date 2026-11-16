/**
 * Tenancy mode.
 *
 * The pooled hosting runtime (registry, per-workspace pools, fleet migrator,
 * edge) has been removed. A few delivery and storage paths still branch on
 * whether a per-workspace origin was resolved; those branches are inert on a
 * single-workspace install.
 */
export function isPooledTenancy(env: Record<string, string | undefined> = process.env): boolean {
  return env.QUACKBACK_TENANCY === 'pooled'
}
