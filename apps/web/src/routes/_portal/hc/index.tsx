import { createFileRoute, redirect } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { HC_LOCALE_COOKIE, resolveHcLandingLocale } from '@/lib/shared/help-center-url'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'
import type { HelpCenterConfig } from '@/lib/shared/types/settings'

/**
 * Bare `/hc` entry point (domains/languages §2).
 *
 * Every help-center page is canonical under `/hc/{locale}/...`; this route only
 * chooses a language (manual cookie, then Accept-Language, then the configured
 * default) and redirects there. Keeping the landing page itself in
 * `/$locale/index.tsx` is what makes the URL scheme single: there is no second
 * render path for the default locale, and its translated copy/SEO/tests live in
 * one place.
 */
const landingRequestContext = createIsomorphicFn()
  .client((): { cookieHeader: string; acceptLanguage: string | null } | null => null)
  .server((): { cookieHeader: string; acceptLanguage: string | null } | null => {
    try {
      const headers = getRequestHeaders()
      return {
        cookieHeader: headers.get('cookie') ?? '',
        acceptLanguage: headers.get('accept-language'),
      }
    } catch {
      return null
    }
  })

/** SSR-only: the browser's preferred enabled locale, or the default. */
function landingLocaleTarget(helpCenterConfig?: HelpCenterConfig): string {
  const defaultLocale = helpCenterConfig?.locales?.default ?? DEFAULT_LOCALE
  const additional = helpCenterConfig?.locales?.additional ?? []
  const req = landingRequestContext()
  if (!req) return defaultLocale
  const cookieMatch = new RegExp(`${HC_LOCALE_COOKIE}=([^;]+)`).exec(req.cookieHeader)
  return (
    resolveHcLandingLocale({
      cookieLocale: cookieMatch?.[1] ?? null,
      acceptLanguage: req.acceptLanguage,
      enabledAdditionalLocales: additional,
      defaultLocale,
    }) ?? defaultLocale
  )
}

export const Route = createFileRoute('/_portal/hc/')({
  beforeLoad: async ({ context }) => {
    const helpCenterConfig = context.settings?.helpCenterConfig as HelpCenterConfig | undefined
    throw redirect({
      to: `/hc/${landingLocaleTarget(helpCenterConfig)}` as '/',
      replace: true,
    })
  },
})
