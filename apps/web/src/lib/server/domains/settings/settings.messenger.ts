/**
 * Messenger settings family.
 *
 * The Messenger is the portal's live-chat surface. Its config and per-locale
 * copy overrides live in `settings.messenger_config` as
 * `{ messenger, translations }`; the base config is merged over
 * {@link DEFAULT_MESSENGER_CONFIG} on read so a stored config that predates a
 * field still resolves sensibly.
 */
import { db, eq, settings } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'
import type {
  MessengerConfig,
  MessengerSettings,
  PublicMessengerConfig,
  UpdateMessengerConfigInput,
} from './settings.types'
import { DEFAULT_MESSENGER_CONFIG } from './settings.types'
import type { MessengerTranslations } from '@/lib/shared/messenger/translations'
import {
  deepMerge,
  invalidateSettingsCache,
  parseJsonOrNull,
  readSettingsRow,
  requireSettings,
  wrapDbError,
  type SettingsFreshness,
  type SettingsWriteOptions,
} from './settings.helpers'

import { logSettingsReadError } from './settings-log'

const log = logger.child({ component: 'settings-messenger' })

/**
 * Parse the stored `messenger_config` JSON. The historical column stored a
 * whole widget config whose `messenger` / `translations` keys are exactly the
 * shape kept here, so the rename keeps existing data readable.
 */
export function parseMessengerSettings(json: string | null): MessengerSettings {
  const stored =
    parseJsonOrNull<{ messenger?: Partial<MessengerConfig>; translations?: MessengerTranslations }>(
      json
    ) ?? {}
  return {
    messenger: deepMerge(DEFAULT_MESSENGER_CONFIG, stored.messenger ?? {}),
    ...(stored.translations !== undefined ? { translations: stored.translations } : {}),
  }
}

export async function getMessengerSettings(
  freshness: SettingsFreshness = 'cached'
): Promise<MessengerSettings> {
  try {
    const org = await readSettingsRow(freshness)
    return parseMessengerSettings(org.messengerConfig)
  } catch (error) {
    logSettingsReadError(log, error, 'get messenger settings failed')
    wrapDbError('fetch messenger settings', error)
  }
}

/** The base Messenger config, deep-merged over the defaults. */
export async function getMessengerConfig(
  freshness: SettingsFreshness = 'cached'
): Promise<MessengerConfig> {
  return (await getMessengerSettings(freshness)).messenger
}

/**
 * Client-safe projection: allowlist, so a new field is excluded unless added
 * here. `enabled` mirrors the `supportInbox` product flag — the stored
 * Messenger `enabled` bit is ignored at the gate.
 */
export function publicMessengerConfig(
  messenger: MessengerConfig,
  enabled: boolean
): PublicMessengerConfig {
  return {
    enabled,
    welcomeMessage: messenger.welcomeMessage,
    offlineMessage: messenger.offlineMessage,
    teamName: messenger.teamName,
    preventRepliesWhenClosed: messenger.preventRepliesWhenClosed,
  }
}

export async function updateMessengerConfig(
  input: UpdateMessengerConfigInput,
  options: SettingsWriteOptions = {}
): Promise<MessengerSettings> {
  log.info('update messenger config')
  try {
    const org = await requireSettings(options.executor)
    const existing = parseMessengerSettings(org.messengerConfig)
    const messenger = input.messenger
      ? deepMerge(existing.messenger, input.messenger)
      : existing.messenger
    const updated: MessengerSettings = {
      messenger,
      // The translations map replaces wholesale — deepMerge would union locale
      // keys, so a removed locale or a cleared field could never disappear.
      translations: input.translations !== undefined ? input.translations : existing.translations,
    }
    await (options.executor ?? db)
      .update(settings)
      .set({ messengerConfig: JSON.stringify(updated) })
      .where(eq(settings.id, org.id))
    if (!options.executor) await invalidateSettingsCache()
    return updated
  } catch (error) {
    log.error({ err: error }, 'update messenger config failed')
    wrapDbError('update messenger config', error)
  }
}

/**
 * Whether the Messenger is live: gated by the Support product flag
 * (`supportInbox`, off by default). This is the single choke point the
 * visitor-facing messenger paths consult, so flipping the flag off fails them
 * all closed.
 */
export async function isMessengerEnabled(): Promise<boolean> {
  const { isFeatureEnabled } = await import('./settings.service')
  return isFeatureEnabled('supportInbox')
}
