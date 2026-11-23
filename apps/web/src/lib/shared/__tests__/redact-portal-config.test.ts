/**
 * Unit tests for redactSettingsForClient.
 *
 * Pure function — no DB, no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { redactSettingsForClient } from '../redact-portal-config'
import type { PortalConfig } from '@/lib/server/domains/settings/settings.types'

const ACCESS_POLICY = {
  visibility: 'private' as const,
  allowedDomains: ['acme.example', 'beta.example'],
  allowedSegmentIds: [],
}

const FULL_PORTAL_CONFIG: PortalConfig = {
  features: {
    allowAnonymous: true,
    allowEditAfterEngagement: false,
    allowDeleteAfterEngagement: false,
    showPublicEditHistory: false,
  },
  moderationDefault: { requireApproval: 'none' },
  access: ACCESS_POLICY,
}

describe('redactSettingsForClient — parsed object portalConfig', () => {
  it('strips allowedDomains, keeps visibility', () => {
    const row = { portalConfig: FULL_PORTAL_CONFIG, name: 'Acme' }
    const result = redactSettingsForClient(row)

    expect(result.portalConfig.access).toEqual({ visibility: 'private' })
    expect(result.portalConfig.access).not.toHaveProperty('allowedDomains')
  })

  it('leaves features and moderationDefault intact', () => {
    const row = { portalConfig: FULL_PORTAL_CONFIG, name: 'Acme' }
    const result = redactSettingsForClient(row)

    expect(result.portalConfig.features).toEqual(FULL_PORTAL_CONFIG.features)
    expect(result.portalConfig.moderationDefault).toEqual(FULL_PORTAL_CONFIG.moderationDefault)
  })

  it('passes through a config with no access key unchanged', () => {
    const noAccess = { ...FULL_PORTAL_CONFIG, access: undefined }
    const row = { portalConfig: noAccess, name: 'Acme' }
    const result = redactSettingsForClient(row)

    expect(result).toBe(row) // same reference — no copy made
  })

  it('passes through null portalConfig unchanged', () => {
    const row = { portalConfig: null, name: 'Acme' }
    const result = redactSettingsForClient(row)

    expect(result).toBe(row)
  })

  it('passes through missing portalConfig unchanged', () => {
    const row = { name: 'Acme' } as { name: string; portalConfig?: PortalConfig | null }
    const result = redactSettingsForClient(row)

    expect(result).toBe(row)
  })
})

describe('redactSettingsForClient — JSON-string portalConfig (raw DB row)', () => {
  it('strips allowedDomains from the JSON string', () => {
    const row = {
      name: 'Acme',
      portalConfig: JSON.stringify(FULL_PORTAL_CONFIG),
    }
    const result = redactSettingsForClient(row)

    const parsed = JSON.parse(result.portalConfig as string) as PortalConfig
    expect(parsed.access).toEqual({ visibility: 'private' })
    expect(parsed.access).not.toHaveProperty('allowedDomains')
  })

  it('leaves the rest of the JSON string intact when redacting', () => {
    const row = {
      name: 'Acme',
      portalConfig: JSON.stringify(FULL_PORTAL_CONFIG),
    }
    const result = redactSettingsForClient(row)

    const parsed = JSON.parse(result.portalConfig as string) as PortalConfig
    expect(parsed.features).toEqual(FULL_PORTAL_CONFIG.features)
    expect(parsed.moderationDefault).toEqual(FULL_PORTAL_CONFIG.moderationDefault)
  })

  it('passes through a JSON string with no access key unchanged', () => {
    const noAccess = { features: FULL_PORTAL_CONFIG.features }
    const row = { name: 'Acme', portalConfig: JSON.stringify(noAccess) }
    const result = redactSettingsForClient(row)

    expect(result).toBe(row)
  })

  it('passes through unparseable JSON strings unchanged', () => {
    const row = { name: 'Acme', portalConfig: 'not valid json' }
    const result = redactSettingsForClient(row)

    expect(result).toBe(row)
  })
})

describe('redactSettingsForClient — allowedSegmentIds redaction', () => {
  it('strips access.allowedSegmentIds from the parsed PortalConfig', () => {
    const row = {
      portalConfig: {
        features: FULL_PORTAL_CONFIG.features,
        moderationDefault: { requireApproval: 'none' as const },
        access: {
          visibility: 'private' as const,
          allowedDomains: ['acme.com'],
          allowedSegmentIds: ['seg_1', 'seg_2'],
        },
      },
    }
    const redacted = redactSettingsForClient(row)
    expect(redacted.portalConfig.access).not.toHaveProperty('allowedSegmentIds')
    expect(redacted.portalConfig.access).toEqual({ visibility: 'private' })
  })

  it('strips access.allowedSegmentIds from the raw JSON-string portalConfig', () => {
    const row = {
      portalConfig: JSON.stringify({
        access: {
          visibility: 'private',
          allowedDomains: ['acme.com'],
          allowedSegmentIds: ['seg_1'],
        },
      }),
    }
    const redacted = redactSettingsForClient(row)
    expect(redacted.portalConfig).not.toContain('allowedSegmentIds')
    expect(redacted.portalConfig).not.toContain('seg_1')
  })
})

describe('redactSettingsForClient — server-only settings columns', () => {
  const RAW_ROW = {
    name: 'Acme',
    metadata: JSON.stringify({ officeHours: {} }),
    setupState: JSON.stringify({ step: 'done' }),
    portalConfig: JSON.stringify(FULL_PORTAL_CONFIG),
  }

  it('strips metadata and setupState from a raw row', () => {
    const result = redactSettingsForClient(RAW_ROW)

    expect(result).not.toHaveProperty('metadata')
    expect(result).not.toHaveProperty('setupState')
    expect(result.name).toBe('Acme')
  })

  it('redacts the raw row riding on a WorkspaceSettings-shaped `.settings` property', () => {
    const workspaceShaped = {
      name: 'Acme',
      portalConfig: FULL_PORTAL_CONFIG,
      settings: { ...RAW_ROW },
    }
    const result = redactSettingsForClient(workspaceShaped)

    expect(result.portalConfig.access).toEqual({ visibility: 'private' })
    const nestedPortalConfig = JSON.parse(
      (result.settings as { portalConfig: string }).portalConfig
    ) as PortalConfig
    expect(nestedPortalConfig.access).toEqual({ visibility: 'private' })
  })

  it('does not mutate the input row', () => {
    const input = { ...RAW_ROW }
    redactSettingsForClient(input)

    expect(input.metadata).toBe(RAW_ROW.metadata)
  })

  it('still returns clean rows by reference', () => {
    const row = { name: 'Acme', portalConfig: null }
    expect(redactSettingsForClient(row)).toBe(row)
  })
})

describe('redactSettingsForClient — the cloud column', () => {
  // The signed projection is server-only enforcement and commercial state.
  const CLOUD_ROW = {
    name: 'Acme',
    cloud: {
      enabled: true,
      projection: { version: 7, effectivePlan: 'scale' },
    },
    portalConfig: null,
  }

  it('strips cloud from a raw row', () => {
    expect(redactSettingsForClient(CLOUD_ROW)).not.toHaveProperty('cloud')
  })

  it('strips cloud from a raw row riding on `.settings`', () => {
    const result = redactSettingsForClient({
      name: 'Acme',
      portalConfig: null,
      settings: { ...CLOUD_ROW },
    })
    expect(result.settings).not.toHaveProperty('cloud')
  })

  it('never leaks the billing projection into the serialized payload', () => {
    const payload = JSON.stringify(
      redactSettingsForClient({ name: 'Acme', portalConfig: null, settings: { ...CLOUD_ROW } })
    )
    expect(payload).not.toContain('effectivePlan')
  })

  it('leaves a row with no cloud column untouched', () => {
    const row = { name: 'Acme', portalConfig: null }
    expect(redactSettingsForClient(row)).toBe(row)
  })
})

describe('redactSettingsForClient — statusConfig redaction', () => {
  const FULL_STATUS = {
    enabled: true,
    portalTabEnabled: true,
    audience: 'segments' as const,
    allowedSegmentIds: ['seg_1', 'seg_2'],
    emailsDisabled: true,
    pageDescription: 'All systems operational',
  }

  it('strips allowedSegmentIds and other non-public fields from statusConfig', () => {
    const row = { portalConfig: null, statusConfig: FULL_STATUS }
    const result = redactSettingsForClient(row)

    expect(result.statusConfig).toEqual({
      enabled: true,
      audience: 'segments',
      pageDescription: 'All systems operational',
    })
    expect(result.statusConfig).not.toHaveProperty('allowedSegmentIds')
    expect(result.statusConfig).not.toHaveProperty('emailsDisabled')
    expect(result.statusConfig).not.toHaveProperty('portalTabEnabled')
  })

  it('never leaks segment ids into the serialized SSR payload', () => {
    const payload = JSON.stringify(
      redactSettingsForClient({ portalConfig: null, statusConfig: FULL_STATUS })
    )
    expect(payload).not.toContain('allowedSegmentIds')
    expect(payload).not.toContain('seg_1')
    expect(payload).not.toContain('emailsDisabled')
  })

  it('does not mutate the input statusConfig', () => {
    const input = { portalConfig: null, statusConfig: { ...FULL_STATUS } }
    redactSettingsForClient(input)
    expect(input.statusConfig.allowedSegmentIds).toEqual(['seg_1', 'seg_2'])
  })
})

describe('redactSettingsForClient — SSR payload invariants', () => {
  it('the SSR payload string does not contain allowedDomains after redaction (object form)', () => {
    const row = { portalConfig: FULL_PORTAL_CONFIG, name: 'Acme' }
    const result = redactSettingsForClient(row)
    const payload = JSON.stringify(result)

    expect(payload).not.toContain('allowedDomains')
    expect(payload).not.toContain('acme.example')
  })

  it('the SSR payload string does not contain allowedDomains after redaction (string form)', () => {
    const row = { name: 'Acme', portalConfig: JSON.stringify(FULL_PORTAL_CONFIG) }
    const result = redactSettingsForClient(row)
    const payload = JSON.stringify(result)

    expect(payload).not.toContain('allowedDomains')
    expect(payload).not.toContain('acme.example')
  })
})
