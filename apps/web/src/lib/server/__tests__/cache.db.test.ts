/**
 * The cache helpers, against a real server.
 *
 * Successor to `redis-cache.test.ts`, which asserted the wire key handed to a
 * fake ioredis. There is no wire key now: this asserts the row that actually
 * lands in `kv_store`, including for the keys built by concatenation at the
 * call site.
 *
 * Failure behaviour (a cache error must read as a miss, never throw) is pinned
 * separately in `cache-failure.test.ts`, which needs a store that can be made
 * to fail on demand.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  ensureKvSchema,
  withRealWorkspace,
  workspacePair,
  uniqueKey,
  cleanupWorkspaces,
  closeHarness,
} from '@/lib/server/kv/__tests__/harness'
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from '../cache'

const [A] = workspacePair()

beforeAll(async () => {
  await ensureKvSchema()
})

afterAll(async () => {
  await cleanupWorkspaces(A)
  await closeHarness()
})

describe('CACHE_KEYS', () => {
  it('exports the expected cache key constants', () => {
    expect(CACHE_KEYS.WORKSPACE_SETTINGS).toBe('settings:workspace')
    expect(CACHE_KEYS.INTEGRATION_MAPPINGS).toBe('hooks:integration-mappings')
    expect(CACHE_KEYS.ACTIVE_WEBHOOKS).toBe('hooks:webhooks-active:v2')
    expect(CACHE_KEYS.SLACK_CHANNELS).toBe('slack:channels')
    expect(CACHE_KEYS.PLATFORM_INTEGRATION_TYPES).toBe('platform-cred:configured-types')
    expect(CACHE_KEYS.REGISTERED_AUTH_PROVIDERS).toBe('auth:registered-providers')
    expect(CACHE_KEYS.PRINCIPAL_BY_USER('user_abc')).toBe('principal:user:user_abc')
  })
})

describe('round trip', () => {
  it('stores and reads a structured value', async () => {
    await withRealWorkspace(A, () => cacheSet(CACHE_KEYS.WORKSPACE_SETTINGS, { name: 'alpha' }, 60))
    expect(await withRealWorkspace(A, () => cacheGet(CACHE_KEYS.WORKSPACE_SETTINGS))).toEqual({
      name: 'alpha',
    })
  })

  it('returns null for a key that was never written', async () => {
    expect(await withRealWorkspace(A, () => cacheGet(uniqueKey('absent')))).toBeNull()
  })

  it('deletes several keys at once', async () => {
    await withRealWorkspace(A, () => cacheSet(CACHE_KEYS.SLACK_CHANNELS, ['a'], 60))
    await withRealWorkspace(A, () => cacheSet(CACHE_KEYS.ACTIVE_WEBHOOKS, ['b'], 60))
    await withRealWorkspace(A, () =>
      cacheDel(CACHE_KEYS.SLACK_CHANNELS, CACHE_KEYS.ACTIVE_WEBHOOKS)
    )
    expect(await withRealWorkspace(A, () => cacheGet(CACHE_KEYS.SLACK_CHANNELS))).toBeNull()
    expect(await withRealWorkspace(A, () => cacheGet(CACHE_KEYS.ACTIVE_WEBHOOKS))).toBeNull()
  })
})
