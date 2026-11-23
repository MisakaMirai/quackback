import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import {
  getPublicArticleBySlugFn,
  getPublicCategoryBySlugFn,
} from '@/lib/server/functions/help-center'
import { resolveHelpCenterRedirectFn } from '@/lib/server/functions/help-center-redirect-rules'
import { hcArticlePath, hcCollectionPath } from '@/lib/shared/help-center-url'
import type { HelpCenterConfig } from '@/lib/shared/types/settings'

/**
 * The single compatibility shim for /hc paths that are not canonical.
 *
 * Canonical is `/hc/{locale}/...` (including the default locale); everything
 * else redirects here rather than in a parallel route family: a legacy
 * unprefixed `/hc/{category}`, `/hc/{category}/{article}`,
 * `/hc/articles/{category}/{article}`, `/hc/categories/{category}`, and their
 * locale-prefixed variants. An admin-configured redirect rule wins over the
 * shape-derived target; an unmatched path is a 404.
 */
export const Route = createFileRoute('/_portal/hc/$')({
  beforeLoad: async ({ params, context }) => {
    const helpCenterConfig = context.settings?.helpCenterConfig as HelpCenterConfig | undefined
    const defaultLocale = helpCenterConfig?.locales?.default ?? 'en'
    const enabledLocales = [defaultLocale, ...(helpCenterConfig?.locales?.additional ?? [])]

    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const path = splat ? `/hc/${splat}` : '/hc'

    const go = (href: string): never => {
      throw redirect({ href, replace: true, statusCode: 301 })
    }

    const ruleTarget = await resolveHelpCenterRedirectFn({ data: { path } })
    if (ruleTarget) go(ruleTarget)

    const rest = splat ? splat.split('/') : []
    const [first, second, third, fourth] = rest

    const articleHref = async (slug: string, locale: string) => {
      const article = await getPublicArticleBySlugFn({ data: { slug, locale } }).catch(() => null)
      if (!article) return null
      return hcArticlePath({ locale, urlId: article.urlId, slug: article.slug })
    }
    const collectionHref = async (slug: string, locale: string) => {
      const category = await getPublicCategoryBySlugFn({ data: { slug, locale } }).catch(() => null)
      if (!category) return null
      return hcCollectionPath({ locale, urlId: category.urlId, slug: category.slug })
    }

    // Locale-prefixed legacy shapes: /hc/{locale}/categories/{slug} and
    // /hc/{locale}/articles/{category}/{article}.
    if (first && enabledLocales.includes(first)) {
      if (rest.length === 3 && second === 'categories' && third) {
        const href = await collectionHref(third, first)
        if (href) go(href)
      }
      if (rest.length === 4 && second === 'articles' && fourth) {
        const href = await articleHref(fourth, first)
        if (href) go(href)
      }
      throw notFound()
    }

    // Unprefixed legacy shapes.
    if (rest.length === 2 && first === 'categories' && second) {
      const href = await collectionHref(second, defaultLocale)
      if (href) go(href)
    }
    if (rest.length === 2 && first !== 'categories' && second) {
      const href = await articleHref(second, defaultLocale)
      if (href) go(href)
    }
    if (rest.length === 3 && first === 'articles' && third) {
      const href = await articleHref(third, defaultLocale)
      if (href) go(href)
    }

    throw notFound()
  },
})
