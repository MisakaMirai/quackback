import { describe, expect, it } from 'vitest'
import { normalizedCallbackPath } from '../verify-magic-link'

/**
 * The verify page forwards its `callbackURL` to Better-Auth, which redirects to
 * it. Invitation emails carry an ABSOLUTE callback URL built from the
 * workspace origin; every other link carries a relative path. Both must become
 * a same-origin path, and nothing may smuggle a host through.
 */
describe('normalizedCallbackPath', () => {
  it('keeps a same-origin relative path as-is', () => {
    expect(normalizedCallbackPath('/complete-signup/invite_1')).toBe('/complete-signup/invite_1')
    expect(normalizedCallbackPath('/admin?tab=members#top')).toBe('/admin?tab=members#top')
  })

  it('reduces an absolute invitation URL to its path and query', () => {
    expect(normalizedCallbackPath('https://acme.example/complete-signup/invite_1')).toBe(
      '/complete-signup/invite_1'
    )
    expect(normalizedCallbackPath('https://acme.example/admin?tab=members')).toBe(
      '/admin?tab=members'
    )
  })

  it('drops the host of an absolute URL, whoever it names', () => {
    // The path is all that survives, so this can only ever redirect within the
    // workspace that served the page.
    expect(normalizedCallbackPath('https://evil.example/admin')).toBe('/admin')
    expect(normalizedCallbackPath('http://evil.example/complete-signup/invite_1')).toBe(
      '/complete-signup/invite_1'
    )
  })

  it('rejects the shapes that could escape the origin', () => {
    expect(normalizedCallbackPath(undefined)).toBeUndefined()
    expect(normalizedCallbackPath('')).toBeUndefined()
    expect(normalizedCallbackPath('//evil.example/admin')).toBeUndefined()
    expect(normalizedCallbackPath('/\\evil.example')).toBeUndefined()
    expect(normalizedCallbackPath('/\t/evil.example')).toBeUndefined()
    expect(normalizedCallbackPath('javascript:alert(1)')).toBeUndefined()
  })
})
