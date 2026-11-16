/**
 * Help Center Config service tests.
 *
 * Verifies:
 * - getHelpCenterConfig() returns defaults when null in DB
 * - getHelpCenterConfig() parses and merges stored config
 * - updateHelpCenterConfig() partial merges and persists
 * - updateHelpCenterConfig() invalidates cache
 * - getWorkspaceSettings() includes helpCenterConfig
 */

import { TierLimitError } from '@/lib/server/errors/tier-limit-error'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Cache mocks ---
const mockCacheGet = vi.fn()
const mockCacheSet = vi.fn()
const mockCacheDel = vi.fn()

const localeLimit = vi.hoisted(() => ({ cap: null as number | null }))
vi.mock('@/lib/server/domains/settings/tier-limits.service', () => ({
  getTierLimits: async () => ({ maxHelpCenterLocales: localeLimit.cap }),
}))
vi.mock('@/lib/server/cache', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
  CACHE_KEYS: {
    WORKSPACE_SETTINGS: 'settings:workspace',
    INTEGRATION_MAPPINGS: 'hooks:integration-mappings',
    ACTIVE_WEBHOOKS: 'hooks:webhooks-active',
    SLACK_CHANNELS: 'slack:channels',
    REGISTERED_AUTH_PROVIDERS: 'auth:registered-providers',
  },
}))

// --- DB mock ---
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
const mockSet = vi.fn()
const mockWhere = vi.fn()
const mockReturning = vi.fn()

const mockExecute = vi.fn(async (..._args: unknown[]) => [])

vi.mock('@/lib/server/db', async (importOriginal) => {
  const mockDb = {
    query: {
      settings: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        limit: () => Promise.resolve([]),
        orderBy: () => Promise.resolve([]),
      }),
    }),
  }
  return {
    // Spread the real db module so tables/operators stay current; override only what this suite drives.
    ...(await importOriginal<typeof import('@/lib/server/db')>()),
    // The transaction runs on the same mock, so reads and writes share its recorders.
    db: Object.assign(mockDb, { transaction: (fn: (tx: unknown) => unknown) => fn(mockDb) }),
    eq: vi.fn(),
  }
})

// --- S3 mock ---
vi.mock('@/lib/server/storage/s3', () => ({
  getPublicUrlOrNull: (key: string | null) => (key ? `https://cdn.test/${key}` : null),
  deleteObject: vi.fn(),
}))

// --- Platform credential mock ---
vi.mock('@/lib/server/domains/platform-credentials/platform-credential.service', () => ({
  getConfiguredIntegrationTypes: vi.fn().mockResolvedValue(new Set()),
  getPlatformCredentials: vi.fn().mockResolvedValue(null),
}))

// --- Email mock ---
vi.mock('@quackback/email', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
}))

// --- Auth providers mock ---
vi.mock('@/lib/server/auth/auth-providers', () => ({
  getAllAuthProviders: vi.fn().mockReturnValue([]),
}))

// A minimal settings row that satisfies requireSettings
function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings_1',
    name: 'Test Workspace',
    slug: 'test',
    authConfig: null,
    portalConfig: null,
    brandingConfig: null,
    developerConfig: null,
    widgetConfig: null,
    helpCenterConfig: null,
    featureFlags: null,
    customCss: null,
    logoKey: null,
    faviconKey: null,
    headerLogoKey: null,
    headerDisplayMode: 'logo_and_name',
    headerDisplayName: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

// Import after mocks
const {
  getHelpCenterConfig,
  updateHelpCenterConfig,
  getWorkspaceSettings,
  enableHelpCenterLocale,
  disableHelpCenterLocale,
  updateHelpCenterLocaleChrome,
} = await import('../settings.service')
const { DEFAULT_HELP_CENTER_CONFIG, DEFAULT_HELP_CENTER_SEO_CONFIG } =
  await import('../settings.types')

beforeEach(() => {
  vi.clearAllMocks()
  mockCacheGet.mockResolvedValue(null)
  mockCacheSet.mockResolvedValue(undefined)
  mockCacheDel.mockResolvedValue(undefined)
  // Chain: db.update().set().where().returning()
  mockReturning.mockResolvedValue([makeSettingsRow()])
  mockWhere.mockReturnValue({ returning: mockReturning })
  mockSet.mockReturnValue({ where: mockWhere })
  mockUpdate.mockReturnValue({ set: mockSet })
})

// ============================================================================
// getHelpCenterConfig
// ============================================================================

describe('getHelpCenterConfig', () => {
  it('returns defaults when helpCenterConfig is null in DB', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    const result = await getHelpCenterConfig()

    expect(result).toEqual(DEFAULT_HELP_CENTER_CONFIG)
  })

  it('returns defaults when helpCenterConfig is invalid JSON', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: 'not json' }))

    const result = await getHelpCenterConfig()

    expect(result).toEqual(DEFAULT_HELP_CENTER_CONFIG)
  })

  it('parses and merges stored config with defaults', async () => {
    const stored = JSON.stringify({
      enabled: true,
      homepageTitle: 'Custom Title',
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getHelpCenterConfig()

    expect(result.enabled).toBe(true)
    expect(result.homepageTitle).toBe('Custom Title')
    // Defaults preserved
    expect(result.homepageDescription).toBe('Search our knowledge base or browse by category')
    expect(result.seo).toEqual(DEFAULT_HELP_CENTER_SEO_CONFIG)
  })

  it('deep merges nested seo config', async () => {
    const stored = JSON.stringify({
      seo: {
        metaDescription: 'Custom meta',
        sitemapEnabled: false,
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getHelpCenterConfig()

    expect(result.seo.metaDescription).toBe('Custom meta')
    expect(result.seo.sitemapEnabled).toBe(false)
    // Preserved from defaults
    expect(result.seo.structuredDataEnabled).toBe(true)
    expect(result.seo.ogImageKey).toBeNull()
  })
})

describe('getHelpCenterConfig stale locales', () => {
  // A workspace may have enabled a locale before its catalog was removed. The
  // read has to drop it, or /hc/de keeps routing, the switcher lists it and the
  // sitemap emits hreflang for a language the build cannot render.
  it('drops unsupported additional locales and chrome, coercing the default to en', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'de',
        additional: ['de', 'zh-cn', 'fr'],
        chrome: {
          de: { homepageTitle: 'Hilfe' },
          'zh-cn': { homepageTitle: '帮助' },
          fr: { homepageTitle: 'Aide' },
        },
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getHelpCenterConfig()

    expect(result.locales.default).toBe('en')
    expect(result.locales.additional).toEqual(['zh-cn'])
    expect(Object.keys(result.locales.chrome)).toEqual(['zh-cn'])
  })

  it('keeps a supported default and supported additional locales untouched', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'zh-tw',
        additional: ['zh-cn'],
        chrome: { 'zh-cn': { homepageTitle: '說明' } },
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getHelpCenterConfig()

    expect(result.locales.default).toBe('zh-tw')
    expect(result.locales.additional).toEqual(['zh-cn'])
    expect(result.locales.chrome['zh-cn']).toEqual({ homepageTitle: '說明' })
  })
})

// ============================================================================
// updateHelpCenterConfig
// ============================================================================

describe('updateHelpCenterConfig', () => {
  it('merges partial input with existing config and persists', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    const result = await updateHelpCenterConfig({ enabled: true, homepageTitle: 'New Title' })

    expect(result.enabled).toBe(true)
    expect(result.homepageTitle).toBe('New Title')
    // Defaults preserved
    expect(result.seo).toEqual(DEFAULT_HELP_CENTER_SEO_CONFIG)

    // Should have persisted
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({
      helpCenterConfig: JSON.stringify(result),
    })
  })

  it('merges with existing stored values', async () => {
    const existing = JSON.stringify({
      enabled: true,
      homepageTitle: 'Existing Title',
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: existing }))

    const result = await updateHelpCenterConfig({ homepageDescription: 'New desc' })

    expect(result.enabled).toBe(true)
    expect(result.homepageTitle).toBe('Existing Title')
    expect(result.homepageDescription).toBe('New desc')
  })

  it('invalidates cache after update', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow())

    await updateHelpCenterConfig({ enabled: true })

    expect(mockCacheDel).toHaveBeenCalledWith('settings:workspace', 'auth:registered-providers')
  })

  it('can update nested seo config', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow())

    const result = await updateHelpCenterConfig({
      seo: {
        metaDescription: 'Updated meta',
        sitemapEnabled: false,
        structuredDataEnabled: true,
        ogImageKey: null,
        indexable: true,
      },
    })

    expect(result.seo.metaDescription).toBe('Updated meta')
    expect(result.seo.sitemapEnabled).toBe(false)
  })
})

// ============================================================================
// getWorkspaceSettings includes helpCenterConfig
// ============================================================================

describe('getWorkspaceSettings includes helpCenterConfig', () => {
  it('includes default helpCenterConfig when DB column is null', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    const result = await getWorkspaceSettings()

    expect(result).not.toBeNull()
    expect(result!.helpCenterConfig).toEqual(DEFAULT_HELP_CENTER_CONFIG)
  })

  it('includes parsed helpCenterConfig from DB', async () => {
    const stored = JSON.stringify({
      enabled: true,
      homepageTitle: 'Help',
    })
    mockCacheGet.mockResolvedValue(null)
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getWorkspaceSettings()

    expect(result).not.toBeNull()
    expect(result!.helpCenterConfig.enabled).toBe(true)
    expect(result!.helpCenterConfig.homepageTitle).toBe('Help')
    // Defaults merged
    expect(result!.helpCenterConfig.seo).toEqual(DEFAULT_HELP_CENTER_SEO_CONFIG)
  })

  // /hc and /hc/{locale} read the help center config from this workspace
  // snapshot, so the stale-locale filter has to run here as well.
  it('filters stale help center locales from the snapshot the /hc routes read', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'de',
        additional: ['de', 'zh-cn'],
        chrome: { de: { homepageTitle: 'Hilfe' }, 'zh-cn': { homepageTitle: '帮助' } },
      },
    })
    mockCacheGet.mockResolvedValue(null)
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await getWorkspaceSettings()

    expect(result!.helpCenterConfig.locales.default).toBe('en')
    expect(result!.helpCenterConfig.locales.additional).toEqual(['zh-cn'])
    expect(Object.keys(result!.helpCenterConfig.locales.chrome)).toEqual(['zh-cn'])
  })
})

// ============================================================================
// Locales (domains/languages §2)
// ============================================================================

describe('enableHelpCenterLocale', () => {
  it('rejects an empty homepage title', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    await expect(
      enableHelpCenterLocale({
        locale: 'zh-cn',
        chrome: { homepageTitle: '   ', homepageDescription: '', searchPlaceholder: '' },
      })
    ).rejects.toThrow(/title/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects enabling the default locale', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    await expect(
      enableHelpCenterLocale({
        locale: 'en',
        chrome: { homepageTitle: 'Hi', homepageDescription: '', searchPlaceholder: '' },
      })
    ).rejects.toThrow(/default/i)
  })

  it('adds the locale to additional and stores its chrome', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    const result = await enableHelpCenterLocale({
      locale: 'zh-cn',
      chrome: {
        homepageTitle: '我们可以如何帮助你？',
        homepageDescription: '',
        searchPlaceholder: '',
      },
    })

    expect(result.additional).toEqual(['zh-cn'])
    expect(result.chrome['zh-cn'].homepageTitle).toBe('我们可以如何帮助你？')
  })

  it('is idempotent when re-enabling an already-enabled locale', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'en',
        additional: ['zh-cn'],
        chrome: { 'zh-cn': { homepageTitle: 'Old' } },
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await enableHelpCenterLocale({
      locale: 'zh-cn',
      chrome: { homepageTitle: 'New title', homepageDescription: '', searchPlaceholder: '' },
    })

    expect(result.additional).toEqual(['zh-cn'])
    expect(result.chrome['zh-cn'].homepageTitle).toBe('New title')
  })
})

describe('enableHelpCenterLocale plan cap', () => {
  const chrome = { homepageTitle: '你好', homepageDescription: '', searchPlaceholder: '' }
  const withLocales = (additional: string[]) =>
    JSON.stringify({
      locales: { default: 'en', additional, chrome: {} },
    })

  beforeEach(() => {
    localeLimit.cap = null
  })

  it('takes the locale slot lock before it reads the language count', async () => {
    localeLimit.cap = 2
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    await enableHelpCenterLocale({ locale: 'zh-cn', chrome })

    expect(mockExecute).toHaveBeenCalledOnce()
    expect(mockExecute.mock.invocationCallOrder[0]).toBeLessThan(
      mockFindFirst.mock.invocationCallOrder[0]
    )
  })

  it('refuses a new locale when the default is the only language the plan allows', async () => {
    localeLimit.cap = 1
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    await expect(enableHelpCenterLocale({ locale: 'zh-cn', chrome })).rejects.toBeInstanceOf(
      TierLimitError
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('counts the default language and allows a new locale below the cap', async () => {
    localeLimit.cap = 2
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    const result = await enableHelpCenterLocale({ locale: 'zh-cn', chrome })
    expect(result.additional).toEqual(['zh-cn'])
  })

  it('refuses a language past the cap once the plan is full', async () => {
    localeLimit.cap = 2
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: withLocales(['zh-cn']) }))

    await expect(enableHelpCenterLocale({ locale: 'zh-tw', chrome })).rejects.toBeInstanceOf(
      TierLimitError
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not refuse re-enabling a locale that is already on', async () => {
    localeLimit.cap = 3
    mockFindFirst.mockResolvedValue(
      makeSettingsRow({ helpCenterConfig: withLocales(['zh-cn', 'zh-tw']) })
    )

    const result = await enableHelpCenterLocale({ locale: 'zh-cn', chrome })
    expect(result.additional).toEqual(['zh-cn', 'zh-tw'])
  })
})

describe('disableHelpCenterLocale', () => {
  it('removes the locale from additional, keeping chrome around', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'en',
        additional: ['zh-cn', 'zh-tw'],
        chrome: { 'zh-cn': { homepageTitle: '帮助' }, 'zh-tw': { homepageTitle: '說明' } },
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await disableHelpCenterLocale('zh-cn')

    expect(result.additional).toEqual(['zh-tw'])
    expect(result.chrome['zh-cn'].homepageTitle).toBe('帮助')
  })
})

describe('updateHelpCenterLocaleChrome', () => {
  it('rejects a locale that is not enabled', async () => {
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: null }))

    await expect(
      updateHelpCenterLocaleChrome({ locale: 'zh-cn', chrome: { homepageTitle: '帮助' } })
    ).rejects.toThrow(/not enabled/i)
  })

  it('merges partial chrome updates for an enabled locale', async () => {
    const stored = JSON.stringify({
      locales: {
        default: 'en',
        additional: ['zh-cn'],
        chrome: {
          'zh-cn': { homepageTitle: '帮助', homepageDescription: 'x', searchPlaceholder: 'y' },
        },
      },
    })
    mockFindFirst.mockResolvedValue(makeSettingsRow({ helpCenterConfig: stored }))

    const result = await updateHelpCenterLocaleChrome({
      locale: 'zh-cn',
      chrome: { searchPlaceholder: '搜索...' },
    })

    expect(result.chrome['zh-cn'].searchPlaceholder).toBe('搜索...')
    expect(result.chrome['zh-cn'].homepageTitle).toBe('帮助')
  })
})
