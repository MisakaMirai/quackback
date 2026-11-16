/**
 * Admin-provided per-locale overrides for messenger welcome/offline copy. The
 * base (untranslated) fields on the config stay the fallback; a locale override
 * wins when present.
 */
export interface MessengerContentTranslation {
  welcomeMessage?: string
  offlineMessage?: string
}

/** Locale code -> overrides. Empty/absent means the base copy is used. */
export type MessengerTranslations = Record<string, MessengerContentTranslation>

/** Display names for admin translation pickers (messenger). */
export const MESSENGER_LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
}

/**
 * The overrides that apply for `locale`: an exact match first, then the base
 * language (so `pt-BR` falls back to `pt`), then nothing. Callers apply the
 * result over the base field with `?? base`.
 */
export function messengerTranslationFor(
  translations: MessengerTranslations | undefined,
  locale: string | undefined | null
): MessengerContentTranslation {
  if (!translations || !locale) return {}
  return translations[locale] ?? translations[locale.split('-')[0]] ?? {}
}
