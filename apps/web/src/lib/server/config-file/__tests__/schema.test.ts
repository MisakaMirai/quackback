import { describe, it, expect } from 'vitest'
import { getDeprecatedConfigKeys, parseQuackbackConfig } from '../schema'

describe('parseQuackbackConfig', () => {
  it('accepts a fully-populated valid config', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      metadata: { source: 'test' },
      spec: {
        workspace: { name: 'Acme', slug: 'acme', useCase: 'saas' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.spec.workspace?.name).toBe('Acme')
    }
  })

  it('accepts an empty spec', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      spec: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing apiVersion', () => {
    const result = parseQuackbackConfig({ kind: 'QuackbackConfig', spec: {} })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown apiVersion', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v2',
      kind: 'QuackbackConfig',
      spec: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid useCase', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      spec: { workspace: { useCase: 'bogus' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown top-level spec keys (no boards/posts here)', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      spec: { boards: [{ name: 'x' }] } as unknown,
    })
    expect(result.success).toBe(false)
  })

  it('accepts deprecated auth and features keys without treating them as schema errors', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      spec: {
        workspace: { name: 'Acme', slug: 'acme' },
        features: { helpCenter: true },
        auth: {
          oauth: { google: true },
          openSignup: false,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp.example.com/.well-known/openid-configuration',
            clientId: 'client-id',
          },
        },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.spec.workspace?.name).toBe('Acme')
      expect(getDeprecatedConfigKeys(result.data.spec)).toEqual(['auth', 'features'])
    }
  })

  it('reports no deprecated keys for a modern config', () => {
    const result = parseQuackbackConfig({
      apiVersion: 'quackback.io/v1',
      kind: 'QuackbackConfig',
      spec: { workspace: { name: 'Acme' } },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(getDeprecatedConfigKeys(result.data.spec)).toEqual([])
    }
  })
})
