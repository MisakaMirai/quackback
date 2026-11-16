'use client'

/**
 * The viewer's language for the admin and portal UI.
 *
 * The app otherwise follows `Accept-Language`, which is a browser/OS setting a
 * person may not be able to change. This card writes the `qb_locale` cookie the
 * bootstrap reads first, then reloads so the server renders the new catalog.
 */
import { useIntl } from 'react-intl'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/shared/i18n'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Each language names itself, so the choice reads in its own script. */
const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  'zh-cn': '简体中文',
  'zh-tw': '繁體中文',
}

export function LanguageCard() {
  const intl = useIntl()
  const current = (SUPPORTED_LOCALES as readonly string[]).includes(intl.locale)
    ? (intl.locale as SupportedLocale)
    : 'en'

  const choose = (next: string) => {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.language.title',
        defaultMessage: 'Language',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.language.description',
        defaultMessage: 'The language used across the admin and portal.',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.language.label',
            defaultMessage: 'Interface language',
          })}
          htmlFor="interface-language"
          control={
            <Select value={current} onValueChange={choose}>
              <SelectTrigger id="interface-language" size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LANGUAGE_NAMES[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingRows>
    </SettingsCard>
  )
}
