import { useIntl } from 'react-intl'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/shared/i18n'
import { cn } from '@/lib/shared/utils'

/** Each language names itself, so the choice reads in its own script. */
const LANGUAGES: { value: SupportedLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-cn', label: '简体中文' },
  { value: 'zh-tw', label: '繁體中文' },
]

/**
 * The portal's language choice. It writes the same `qb_locale` cookie the
 * bootstrap reads first, then reloads so the server renders the new catalog.
 */
export function LanguageSwitcher() {
  const intl = useIntl()
  const current = (SUPPORTED_LOCALES as readonly string[]).includes(intl.locale)
    ? (intl.locale as SupportedLocale)
    : 'en'

  const choose = (locale: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map((language) => {
        const isActive = language.value === current
        return (
          <button
            key={language.value}
            type="button"
            onClick={() => choose(language.value)}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2 transition-all',
              isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            <span className="text-sm font-medium">{language.label}</span>
          </button>
        )
      })}
    </div>
  )
}
