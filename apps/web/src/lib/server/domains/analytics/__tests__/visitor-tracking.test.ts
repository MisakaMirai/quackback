// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTierLimits = vi.fn()
vi.mock('@/lib/server/domains/settings/tier-limits.service', () => ({
  getTierLimits: mockGetTierLimits,
}))

const { isVisitorAnalyticsEntitled } = await import('../visitor-tracking')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isVisitorAnalyticsEntitled', () => {
  it('reads the visitorAnalytics plan feature', async () => {
    mockGetTierLimits.mockResolvedValue({ features: { visitorAnalytics: true } })
    await expect(isVisitorAnalyticsEntitled()).resolves.toBe(true)

    mockGetTierLimits.mockResolvedValue({ features: { visitorAnalytics: false } })
    await expect(isVisitorAnalyticsEntitled()).resolves.toBe(false)
  })

  it('fails closed when the tier limits cannot be read', async () => {
    mockGetTierLimits.mockRejectedValue(new Error('settings read failed'))
    await expect(isVisitorAnalyticsEntitled()).resolves.toBe(false)
  })
})
