/**
 * The help center has one canonical URL scheme (`/hc/{locale}/...`). Legacy
 * shapes must 301 to it rather than rendering a second copy, and an
 * admin-configured redirect rule wins over the shape-derived target.
 */
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublicArticleBySlugFn: vi.fn(),
  getPublicCategoryBySlugFn: vi.fn(),
  resolveHelpCenterRedirectFn: vi.fn(),
}))

vi.mock('@/lib/server/functions/help-center', () => ({
  getPublicArticleBySlugFn: mocks.getPublicArticleBySlugFn,
  getPublicCategoryBySlugFn: mocks.getPublicCategoryBySlugFn,
}))
vi.mock('@/lib/server/functions/help-center-redirect-rules', () => ({
  resolveHelpCenterRedirectFn: mocks.resolveHelpCenterRedirectFn,
}))

const { Route: BareRoute } = await import('../_portal/hc/index')
const { Route: LocaleRoute } = await import('../_portal/hc/$locale')
const { Route: SplatRoute } = await import('../_portal/hc/$')

const settings = { helpCenterConfig: { locales: { default: 'en', additional: ['de'] } } }
const context = { settings }
const article = { urlId: 7, slug: 'getting-started' }
const category = { urlId: 9, slug: 'billing' }

function optionsOf(thrown: unknown): Record<string, unknown> {
  expect(thrown).toBeInstanceOf(Response)
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  return (thrown as any).options as Record<string, unknown>
}

async function run(fn: (args: never) => unknown, args: Record<string, unknown>) {
  try {
    await fn(args as never)
  } catch (error) {
    return { error }
  }
  throw new Error('expected a redirect or notFound')
}

describe('bare /hc', () => {
  it('redirects to the default-locale landing', async () => {
    const { error } = await run(BareRoute.options.beforeLoad as never, { context })
    expect(optionsOf(error)).toMatchObject({ to: '/hc/en' })
  })
})

describe('single-segment legacy category', () => {
  it('looks up the category as the default locale and 301s to its collection', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue(null)
    mocks.getPublicCategoryBySlugFn.mockResolvedValue(category)
    const { error } = await run(LocaleRoute.options.beforeLoad as never, {
      context,
      params: { locale: 'billing' },
    })
    expect(mocks.getPublicCategoryBySlugFn).toHaveBeenCalledWith({
      data: { slug: 'billing', locale: 'en' },
    })
    expect(optionsOf(error)).toMatchObject({
      href: '/hc/en/collections/9-billing',
      statusCode: 301,
    })
  })
})

describe('catch-all legacy shapes', () => {
  it('resolves /hc/categories/{slug} to the canonical collection', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue(null)
    mocks.getPublicCategoryBySlugFn.mockResolvedValue(category)
    const { error } = await run(SplatRoute.options.beforeLoad as never, {
      context,
      params: { _splat: 'categories/billing' },
    })
    expect(optionsOf(error)).toMatchObject({
      href: '/hc/en/collections/9-billing',
      statusCode: 301,
    })
  })

  it('resolves /hc/articles/{category}/{article} to the canonical article', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue(null)
    mocks.getPublicArticleBySlugFn.mockResolvedValue(article)
    const { error } = await run(SplatRoute.options.beforeLoad as never, {
      context,
      params: { _splat: 'articles/basics/getting-started' },
    })
    expect(optionsOf(error)).toMatchObject({
      href: '/hc/en/articles/7-getting-started',
      statusCode: 301,
    })
  })

  it('resolves the old two-segment category/article shape', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue(null)
    mocks.getPublicArticleBySlugFn.mockResolvedValue(article)
    const { error } = await run(SplatRoute.options.beforeLoad as never, {
      context,
      params: { _splat: 'basics/getting-started' },
    })
    expect(optionsOf(error)).toMatchObject({
      href: '/hc/en/articles/7-getting-started',
      statusCode: 301,
    })
  })

  it('keeps a locale prefix on the locale-scoped legacy shapes', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue(null)
    mocks.getPublicCategoryBySlugFn.mockResolvedValue({ urlId: 3, slug: 'konto' })
    const { error } = await run(SplatRoute.options.beforeLoad as never, {
      context,
      params: { _splat: 'de/categories/konto' },
    })
    expect(mocks.getPublicCategoryBySlugFn).toHaveBeenCalledWith({
      data: { slug: 'konto', locale: 'de' },
    })
    expect(optionsOf(error)).toMatchObject({
      href: '/hc/de/collections/3-konto',
      statusCode: 301,
    })
  })

  it('lets an admin redirect rule win over the legacy shape', async () => {
    mocks.resolveHelpCenterRedirectFn.mockResolvedValue('https://example.com/elsewhere')
    mocks.getPublicCategoryBySlugFn.mockResolvedValue(category)
    const { error } = await run(SplatRoute.options.beforeLoad as never, {
      context,
      params: { _splat: 'categories/billing' },
    })
    expect(optionsOf(error)).toMatchObject({ href: 'https://example.com/elsewhere' })
    expect(mocks.getPublicCategoryBySlugFn).not.toHaveBeenCalled()
  })
})
