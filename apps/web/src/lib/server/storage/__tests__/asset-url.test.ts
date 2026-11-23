/**
 * Off-host leaves absolutize persist refs from the immutable system host.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/config', () => ({
  config: {
    baseUrl: 'https://env-app.example.net',
    s3PublicUrl: 'https://env-cdn.example.net',
  },
}))

const {
  absolutizeOffHostAssetUrl,
  getSystemAssetOrigin,
  isStoredAssetPath,
  storedAssetKeyFromSrc,
  systemHostOriginFromPublicUrl,
} = await import('../asset-url')

const KEY = 'logos/2026/08/brand.png'

describe('systemHostOriginFromPublicUrl', () => {
  it('reads the origin of a pinned https://host/api/storage value', () => {
    expect(systemHostOriginFromPublicUrl('https://ws-abc123.quackback.co.uk/api/storage')).toBe(
      'https://ws-abc123.quackback.co.uk'
    )
    expect(systemHostOriginFromPublicUrl('https://ws-abc123.quackback.co.uk/api/storage/')).toBe(
      'https://ws-abc123.quackback.co.uk'
    )
  })

  it('ignores CDN-style publicUrl values', () => {
    expect(systemHostOriginFromPublicUrl('https://assets-workspace.example.com')).toBeNull()
    expect(systemHostOriginFromPublicUrl('https://cdn.example.com/bucket')).toBeNull()
    expect(systemHostOriginFromPublicUrl('')).toBeNull()
  })
})

describe('getSystemAssetOrigin', () => {
  it('is the configured base URL, without a trailing slash', () => {
    expect(getSystemAssetOrigin()).toBe('https://env-app.example.net')
  })
})

describe('absolutizeOffHostAssetUrl', () => {
  it('prefixes relative persist refs with the configured origin', () => {
    expect(absolutizeOffHostAssetUrl(`/api/storage/${KEY}`)).toBe(
      `https://env-app.example.net/api/storage/${KEY}`
    )
  })

  it('rewrites a legacy storage src from another host onto the configured origin', () => {
    expect(absolutizeOffHostAssetUrl(`https://acme.quackback.co.uk/api/storage/${KEY}`)).toBe(
      `https://env-app.example.net/api/storage/${KEY}`
    )
  })

  it('leaves a legacy CDN src untouched', () => {
    expect(absolutizeOffHostAssetUrl(`https://cdn.example.com/${KEY}`)).toBe(
      `https://cdn.example.com/${KEY}`
    )
  })

  it('adds the email proxy hint on storage refs', () => {
    expect(absolutizeOffHostAssetUrl(`/api/storage/${KEY}?read=abc`, { email: true })).toBe(
      `https://env-app.example.net/api/storage/${KEY}?read=abc&email=1`
    )
  })

  it('does not treat /api/storage as a stored asset path', () => {
    expect(isStoredAssetPath('/api/storage')).toBe(false)
    expect(isStoredAssetPath('/api/storage/')).toBe(false)
    expect(isStoredAssetPath(`/api/storage/${KEY}`)).toBe(true)
  })
})

describe('storedAssetKeyFromSrc', () => {
  it('reads the key from a relative persist ref, discarding a stale token', () => {
    expect(storedAssetKeyFromSrc(`/api/storage/${KEY}?read=stale`)).toBe(KEY)
  })

  it('reads the key from a legacy absolute URL on any host', () => {
    expect(storedAssetKeyFromSrc(`https://old.example.com/api/storage/${KEY}`)).toBe(KEY)
  })

  it('refuses a path that is not a stored asset', () => {
    expect(storedAssetKeyFromSrc('https://cdn.example.com/logos/brand.png')).toBeNull()
    expect(storedAssetKeyFromSrc('/api/storage/../secret')).toBeNull()
  })
})
