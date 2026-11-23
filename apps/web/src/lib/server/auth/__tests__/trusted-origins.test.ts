import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { originsForHostnames } from '../trusted-origins'

describe('originsForHostnames', () => {
  it('includes the configured origin and every listed hostname', () => {
    expect(
      originsForHostnames('https://app.customer.test', [
        'app.customer.test',
        'portal.customer.test',
        'help.customer.test',
      ])
    ).toEqual([
      'https://app.customer.test',
      'https://portal.customer.test',
      'https://help.customer.test',
    ])
  })

  it('skips empty and wildcard hostnames', () => {
    expect(
      originsForHostnames('https://app.customer.test', ['', '*.customer.test', 'ok.customer.test'])
    ).toEqual(['https://app.customer.test', 'https://ok.customer.test'])
  })
})

describe('trustedAuthOrigins', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('BASE_URL', 'https://app.customer.test')
    vi.stubEnv('SECRET_KEY', 'a'.repeat(64))
    vi.stubEnv('DATABASE_URL', 'postgresql://u@localhost:5432/x')
    vi.stubEnv('TRUSTED_ORIGINS', ' https://portal.customer.test , https://help.customer.test ')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('trusts BASE_URL and every origin the operator listed', async () => {
    const { trustedAuthOrigins } = await import('../trusted-origins')
    expect(trustedAuthOrigins()).toEqual([
      'https://app.customer.test',
      'https://portal.customer.test',
      'https://help.customer.test',
    ])
  })

  it('trusts nothing extra when TRUSTED_ORIGINS is unset', async () => {
    vi.stubEnv('TRUSTED_ORIGINS', '')
    const { trustedAuthOrigins } = await import('../trusted-origins')
    expect(trustedAuthOrigins()).toEqual(['https://app.customer.test'])
  })
})
