import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { settings } from '../auth'

/**
 * SQL names Drizzle emits on `settings` findFirst(). A missing column is a
 * throw, not a null — that is the new-mint 500
 * (`Failed to fetch settings with all configs`).
 *
 * When this list changes, add an expand-only migration in
 * `packages/db/drizzle`. The serving image also migrates a behind-ledger
 * workspace on first pool checkout (`ensureWorkspaceSchemaCurrent`), so a
 * short schema is caught before the first read rather than as a 500.
 */
export const SETTINGS_SQL_COLUMNS = [
  'id',
  'name',
  'slug',
  'logo_key',
  'favicon_key',
  'header_logo_key',
  'portal_og_image_key',
  'created_at',
  'metadata',
  'auth_config',
  'portal_config',
  'branding_config',
  'custom_css',
  'developer_config',
  'header_display_mode',
  'header_display_name',
  'setup_state',
  'messenger_config',
  'feature_flags',
  'spam_filter_config',
  'help_center_config',
  'managed_field_paths',
  'auth_config_version',
] as const

describe('settings columns the serving image queries', () => {
  it('matches the lock list (update this list AND re-vendor the CP when it fails)', () => {
    const names = Object.values(getTableColumns(settings)).map((c) => c.name)
    expect([...names].sort()).toEqual([...SETTINGS_SQL_COLUMNS].sort())
  })
})
