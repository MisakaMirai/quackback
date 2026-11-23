import { createFileRoute, notFound, redirect, Outlet } from '@tanstack/react-router'
import { getPublicCategoryBySlugFn } from '@/lib/server/functions/help-center'
import { resolveHelpCenterRedirectFn } from '@/lib/server/functions/help-center-redirect-rules'
import { hcCollectionPath } from '@/lib/shared/help-center-url'
import type { HelpCenterConfig } from '@/lib/shared/types/settings'

/**
 * Locale-prefixed /hc subtree: `/hc/{locale}/...` is the one canonical URL
 * scheme, articles and collections included, for the default locale too.
 * Unknown locales 404 — except that a single-segment `/hc/{slug}` is the
 * legacy category URL, which redirects to its canonical collection page (or to
 * an admin-configured redirect rule).
 */
export const Route = createFileRoute('/_portal/hc/$locale')({
  beforeLoad: async ({ context, params }) => {
    const { settings } = context
    const helpCenterConfig = settings?.helpCenterConfig as HelpCenterConfig | undefined
    const additional = helpCenterConfig?.locales?.additional ?? []
    const defaultLocale = helpCenterConfig?.locales?.default ?? 'en'
    if (params.locale === defaultLocale || additional.includes(params.locale)) return

    const path = `/hc/${params.locale}`
    const target = await resolveHelpCenterRedirectFn({ data: { path } })
    if (target) throw redirect({ href: target, replace: true, statusCode: 301 })

    const category = await getPublicCategoryBySlugFn({
      data: { slug: params.locale, locale: defaultLocale },
    }).catch(() => null)
    if (category) {
      throw redirect({
        href: hcCollectionPath({
          locale: defaultLocale,
          urlId: category.urlId,
          slug: category.slug,
        }),
        replace: true,
        statusCode: 301,
      })
    }

    throw notFound()
  },
  component: () => <Outlet />,
})
