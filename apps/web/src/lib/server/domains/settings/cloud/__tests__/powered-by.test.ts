import { describe, expect, it } from 'vitest'
import { DISABLED_CLOUD_CONFIG, type CloudConfig } from '../cloud.types'
import { shouldShowPoweredBy } from '../powered-by'

function cloudOn(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    ...DISABLED_CLOUD_CONFIG,
    enabled: true,
    plan: 'pro',
    ...overrides,
  }
}

describe('shouldShowPoweredBy', () => {
  it('always shows on a self-hosted install', () => {
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(true)
  })

  it('is the same rule for portal, widget, and branded emails', () => {
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(true)
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: true } }))).toBe(false)
  })

  it('shows on cloud until the add-on is purchased', () => {
    expect(shouldShowPoweredBy(cloudOn({ entitlements: {} }))).toBe(true)
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: false } }))).toBe(true)
  })

  it('hides on cloud only when the overlay is purchased', () => {
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: true } }))).toBe(false)
  })
})
