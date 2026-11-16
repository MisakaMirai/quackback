/**
 * Per-locale widget copy overrides: exact-locale match, base-language fallback
 * (de-AT -> de), and empty when nothing matches (callers fall back to base).
 */
import { describe, it, expect } from 'vitest'
import { messengerTranslationFor } from '../translations'

const T = {
  de: { welcomeMessage: 'Hallo', offlineMessage: 'Wir sind offline' },
  'fr-CA': { welcomeMessage: 'Bonjour' },
}

describe('messengerTranslationFor', () => {
  it('returns the exact-locale overrides', () => {
    expect(messengerTranslationFor(T, 'de').welcomeMessage).toBe('Hallo')
    expect(messengerTranslationFor(T, 'fr-CA').welcomeMessage).toBe('Bonjour')
  })

  it('falls back from a regional locale to its base language', () => {
    expect(messengerTranslationFor(T, 'de-AT').offlineMessage).toBe('Wir sind offline')
  })

  it('returns empty when no locale, no map, or no match', () => {
    expect(messengerTranslationFor(T, 'es')).toEqual({})
    expect(messengerTranslationFor(T, undefined)).toEqual({})
    expect(messengerTranslationFor(undefined, 'de')).toEqual({})
  })

  it('prefers an exact regional match over the base language', () => {
    const t = { fr: { welcomeMessage: 'base-fr' }, 'fr-CA': { welcomeMessage: 'quebec' } }
    expect(messengerTranslationFor(t, 'fr-CA').welcomeMessage).toBe('quebec')
  })
})
