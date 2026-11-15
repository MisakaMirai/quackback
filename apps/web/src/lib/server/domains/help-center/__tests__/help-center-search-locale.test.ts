import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLimit = vi.fn()

/** A chain mock where every method returns itself except the terminal `limit`. */
function makeChain() {
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.limit = (...args: unknown[]) => mockLimit(...args)
  return chain
}

vi.mock('@/lib/server/db', () => ({
  db: { select: vi.fn(() => makeChain()) },
  helpCenterCategories: {
    id: 'id',
    slug: 'slug',
    name: 'name',
    isPublic: 'is_public',
    deletedAt: 'cat_deleted',
  },
  helpCenterArticles: {
    id: 'id',
    slug: 'slug',
    title: 'title',
    description: 'description',
    content: 'content',
    categoryId: 'category_id',
    deletedAt: 'deleted_at',
    publishedAt: 'published_at',
  },
  helpCenterArticleTranslations: {
    articleId: 'article_id',
    locale: 'locale',
    status: 'status',
    title: 'title',
    description: 'description',
    content: 'content',
    searchVector: 'search_vector',
  },
  helpCenterCategoryTranslations: { categoryId: 'category_id', locale: 'locale', name: 'name' },
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  isNull: vi.fn((...args: unknown[]) => ({ op: 'isNull', args })),
  isNotNull: vi.fn((...args: unknown[]) => ({ op: 'isNotNull', args })),
  lte: vi.fn((...args: unknown[]) => ({ op: 'lte', args })),
  regconfigForLocale: (locale: string) =>
    ({ de: 'german', fr: 'french', 'zh-cn': 'simple' })[locale] ?? 'english',
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const stub = { strings, values, as: () => stub }
      return stub
    }),
    { raw: (s: string) => s }
  ),
}))

const { orTermsTsQueryForLocale, hybridSearchForLocale } =
  await import('../help-center-search.service')

beforeEach(() => {
  mockLimit.mockReset()
  mockLimit.mockResolvedValue([])
})

describe('orTermsTsQueryForLocale', () => {
  it('uses the locale-specific regconfig, not english', () => {
    const result = orTermsTsQueryForLocale('rechnung stellen', 'de') as unknown as {
      values: unknown[]
    }
    expect(result.values[0]).toBe('german')
  })

  it('falls back to english for a locale with no regconfig entry', () => {
    const result = orTermsTsQueryForLocale('billing', 'xx') as unknown as { values: unknown[] }
    expect(result.values[0]).toBe('english')
  })
})

describe('hybridSearchForLocale', () => {
  it('runs the keyword-only full-text search for the default locale', async () => {
    const results = await hybridSearchForLocale('invoices', 'en', 5)
    expect(results).toEqual([])
    // The embedding-backed hybrid path is gone: even the default locale is a
    // plain keyword full-text query, which terminates in a single limit().
    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it('runs the keyword-only translation query for an additional locale', async () => {
    const results = await hybridSearchForLocale('rechnung', 'de', 5)
    expect(results).toEqual([])
    expect(mockLimit).toHaveBeenCalledWith(5)
  })
})
