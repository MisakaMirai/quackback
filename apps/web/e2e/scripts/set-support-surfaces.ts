/**
 * CLI: idempotently enable (or disable) the conversation surfaces for e2e runs.
 *
 * "on" turns on everything the conversation surfaces need:
 *   - featureFlags.supportInbox        (gates /admin/inbox + all conversation paths)
 *   - portalConfig.support.enabled     (portal /support tab)
 *
 * "on all" also enables the neighbouring products the performance bench loads
 * (supportTickets, helpCenter, changelog, feedback) so its pages render instead
 * of redirecting. Plain "on" leaves those flags alone for e2e specs.
 *
 * "off" flips the flag and portal support back off; "off all" also turns those
 * neighbouring products off.
 *
 * "seed" puts every product flag back to the value a fresh seed writes, for a
 * spec that turned several of them on and wants to hand the workspace back
 * unchanged. The values mirror `DEFAULT_FEATURE_FLAGS` in
 * `src/lib/server/domains/settings/settings.types.ts`; keep the two in step.
 *
 * The settings JSON columns are *text*, so we read -> patch -> write, then
 * drop the Redis-cached workspace settings (settings:workspace) so the running dev
 * server sees the change immediately instead of after the 1h cache TTL.
 *
 * Usage: bun set-support-surfaces.ts <on|off|seed> [all]
 */
import { openDb, bustWorkspaceSettings, parseJson } from './_lib'

const mode = (process.argv[2] || 'on').toLowerCase()
if (mode !== 'on' && mode !== 'off' && mode !== 'seed') {
  console.error('Usage: bun set-support-surfaces.ts <on|off|seed> [all]')
  process.exit(1)
}
const restoringSeed = mode === 'seed'
const enabled = mode === 'on'
/** The performance bench visits every product page, so it enables them all. */
const allSurfaces = (process.argv[3] || '').toLowerCase() === 'all'

const sql = openDb()

try {
  const rows =
    await sql`SELECT id, feature_flags, portal_config FROM settings ORDER BY created_at ASC LIMIT 1`
  if (rows.length === 0) throw new Error('No settings row found (run the seed first)')
  const id = rows[0].id as string

  const flags = parseJson(rows[0].feature_flags)
  if (restoringSeed) {
    // Mirror of DEFAULT_FEATURE_FLAGS (settings.types.ts).
    flags.feedback = true
    flags.changelog = true
    flags.helpCenter = false
    flags.supportInbox = false
    flags.supportTickets = false
    flags.statusPage = false
  } else {
    flags.supportInbox = enabled
    if (allSurfaces) {
      flags.supportTickets = enabled
      flags.helpCenter = enabled
      flags.changelog = enabled
      flags.feedback = enabled
    }
  }

  const portal = parseJson(rows[0].portal_config)
  portal.support = {
    ...((portal.support as object) ?? {}),
    enabled: restoringSeed ? false : enabled,
  }

  await sql`
    UPDATE settings
    SET feature_flags = ${JSON.stringify(flags)},
        portal_config = ${JSON.stringify(portal)}
    WHERE id = ${id}`

  // Bust the workspace-settings cache so the change is visible on the next request.
  await bustWorkspaceSettings(sql)

  console.log(JSON.stringify({ supportSurfaces: mode }))
  await sql.end()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  await sql.end()
  process.exit(1)
}
