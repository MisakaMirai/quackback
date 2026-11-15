import { describe, it, expect, beforeEach, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  mockIsFeatureEnabled: vi.fn(),
  mockGetPortalConfig: vi.fn(),
  mockIsMessengerEnabled: vi.fn(),
}))

vi.mock('../settings.service', () => ({
  isFeatureEnabled: hoisted.mockIsFeatureEnabled,
  getPortalConfig: hoisted.mockGetPortalConfig,
}))

vi.mock('../settings.messenger', () => ({
  isMessengerEnabled: hoisted.mockIsMessengerEnabled,
}))

import { isPortalSupportEnabled, isConversationsEnabled } from '../settings.support'
import { DEFAULT_PORTAL_CONFIG } from '../settings.types'
import { isPortalSupportSurfaceEnabled } from '@/lib/shared/support-surfaces'

describe('DEFAULT_PORTAL_CONFIG.support', () => {
  it('is on by default so Support ON is enough to start portal chats', () => {
    expect(DEFAULT_PORTAL_CONFIG.support?.enabled).toBe(true)
  })
})

describe('isPortalSupportSurfaceEnabled', () => {
  it.each([
    { tickets: false, inbox: true, enabled: true, expected: true },
    { tickets: false, inbox: false, enabled: true, expected: false },
    { tickets: false, inbox: true, enabled: false, expected: false },
    { tickets: true, inbox: false, enabled: false, expected: true },
    { tickets: true, inbox: true, enabled: false, expected: true },
  ])(
    'tickets=$tickets inbox=$inbox enabled=$enabled → $expected',
    ({ tickets, inbox, enabled, expected }) => {
      expect(
        isPortalSupportSurfaceEnabled(
          { supportTickets: tickets, supportInbox: inbox },
          { support: { enabled } }
        )
      ).toBe(expected)
    }
  )
})

describe('isPortalSupportEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { inbox: true, tickets: false, support: { enabled: true }, expected: true },
    { inbox: false, tickets: false, support: { enabled: true }, expected: false },
    { inbox: true, tickets: false, support: { enabled: false }, expected: false },
    { inbox: true, tickets: false, support: undefined, expected: false },
    { inbox: false, tickets: true, support: { enabled: false }, expected: true },
  ])(
    'inbox=$inbox tickets=$tickets support=$support → $expected',
    async ({ inbox, tickets, support, expected }) => {
      hoisted.mockIsFeatureEnabled.mockImplementation(async (flag: string) =>
        flag === 'supportTickets' ? tickets : flag === 'supportInbox' ? inbox : false
      )
      hoisted.mockGetPortalConfig.mockResolvedValue({ support })
      expect(await isPortalSupportEnabled()).toBe(expected)
    }
  )

  it('checks the supportInbox and supportTickets flags', async () => {
    hoisted.mockIsFeatureEnabled.mockResolvedValue(true)
    hoisted.mockGetPortalConfig.mockResolvedValue({ support: { enabled: true } })
    await isPortalSupportEnabled()
    expect(hoisted.mockIsFeatureEnabled).toHaveBeenCalledWith('supportInbox')
    expect(hoisted.mockIsFeatureEnabled).toHaveBeenCalledWith('supportTickets')
  })
})

describe('isConversationsEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Converged Messages: tickets count as a conversation surface — every
  // customer ticket is a conversation pair, so an email-first workspace with
  // the messenger off still lists and replies to its threads.
  it.each([
    { messenger: true, portalSupport: false, tickets: false, expected: true },
    { messenger: false, portalSupport: true, tickets: false, expected: true },
    { messenger: true, portalSupport: true, tickets: false, expected: true },
    { messenger: false, portalSupport: false, tickets: true, expected: true },
    { messenger: false, portalSupport: false, tickets: false, expected: false },
  ])(
    'messenger=$messenger portalSupport=$portalSupport tickets=$tickets → $expected',
    async ({ messenger, portalSupport, tickets, expected }) => {
      hoisted.mockIsFeatureEnabled.mockImplementation(async (flag: string) =>
        flag === 'supportTickets' ? tickets : true
      )
      hoisted.mockIsMessengerEnabled.mockResolvedValue(messenger)
      hoisted.mockGetPortalConfig.mockResolvedValue({ support: { enabled: portalSupport } })
      expect(await isConversationsEnabled()).toBe(expected)
    }
  )
})
