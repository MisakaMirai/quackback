/**
 * Viewer threading for the knowledge-base search endpoint: the portal
 * principal resolved from the request must become a policy actor (with segment
 * memberships) that flows into search. Presence/absence of a session is
 * resolved by `policyActorFromAuth`, which is covered by its own test; this
 * pins the endpoint wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrincipalId, SegmentId } from '@quackback/ids'
import { ANONYMOUS_ACTOR } from '@/lib/server/policy/types'

const mockIsFeatureEnabled = vi.fn()
const mockGetHelpCenterConfig = vi.fn()
vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
  getHelpCenterConfig: (...args: unknown[]) => mockGetHelpCenterConfig(...args),
}))

const mockHybridSearchForLocale = vi.fn()
vi.mock('@/lib/server/domains/help-center/help-center-search.service', () => ({
  hybridSearchForLocale: (...args: unknown[]) => mockHybridSearchForLocale(...args),
  resolveSearchLocale: (requested: string | undefined, enabled: string[], defaultLocale: string) =>
    requested && enabled.includes(requested) ? requested : defaultLocale,
}))

const mockIncrementBucket = vi.fn()
vi.mock('@/lib/server/utils/rate-bucket', () => ({
  incrementBucket: (...args: unknown[]) => mockIncrementBucket(...args),
  bucketRetryAfter: vi.fn().mockResolvedValue(30),
}))

const mockGetOptionalAuth = vi.fn()
const mockPolicyActorFromAuth = vi.fn()
vi.mock('@/lib/server/functions/auth-helpers', () => ({
  getOptionalAuth: (...args: unknown[]) => mockGetOptionalAuth(...args),
  policyActorFromAuth: (...args: unknown[]) => mockPolicyActorFromAuth(...args),
}))

import { handleKbSearch } from '../kb-search'

const PRINCIPAL = 'principal_01hzuser0000000000000000000' as PrincipalId
const SEG = 'segment_01hzseg000000000000000000000' as SegmentId

function makeRequest(q = 'hello'): Request {
  const url = new URL('http://localhost/api/kb-search')
  url.searchParams.set('q', q)
  return new Request(url, { headers: { 'x-forwarded-for': '203.0.113.9' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsFeatureEnabled.mockResolvedValue(true)
  mockGetHelpCenterConfig.mockResolvedValue({ locales: { additional: [], default: 'en' } })
  mockIncrementBucket.mockResolvedValue({ count: 1 })
  mockHybridSearchForLocale.mockResolvedValue([])
  mockGetOptionalAuth.mockResolvedValue(null)
  mockPolicyActorFromAuth.mockResolvedValue(ANONYMOUS_ACTOR)
})

describe('GET /api/kb-search viewer threading', () => {
  it('unidentified callers search as the anonymous actor (fail closed)', async () => {
    const res = await handleKbSearch({ request: makeRequest() })
    expect(res.status).toBe(200)
    expect(mockPolicyActorFromAuth).toHaveBeenCalledWith(null)
    expect(mockHybridSearchForLocale).toHaveBeenCalledWith('hello', 'en', 10, ANONYMOUS_ACTOR)
  })

  it('a signed-in portal principal threads its resolved segments into search', async () => {
    const auth = {
      principal: { id: PRINCIPAL, role: 'user', type: 'user' },
    }
    const actor = {
      principalId: PRINCIPAL,
      role: 'user',
      principalType: 'user',
      segmentIds: new Set([SEG]),
    }
    mockGetOptionalAuth.mockResolvedValue(auth)
    mockPolicyActorFromAuth.mockResolvedValue(actor)

    const res = await handleKbSearch({ request: makeRequest() })
    expect(res.status).toBe(200)
    expect(mockPolicyActorFromAuth).toHaveBeenCalledWith(auth)
    expect(mockHybridSearchForLocale).toHaveBeenCalledWith('hello', 'en', 10, actor)
  })
})
