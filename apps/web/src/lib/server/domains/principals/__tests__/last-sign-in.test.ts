import { describe, expect, it } from 'vitest'
import { latestSignInAt } from '../last-sign-in'

describe('latestSignInAt', () => {
  const session = new Date('2026-01-02T00:00:00.000Z')
  const sso = new Date('2026-01-01T00:00:00.000Z')

  it('keeps the newest session when it is later than the SSO stamp', () => {
    expect(latestSignInAt(session, sso)).toEqual(session)
  })

  it('falls back to the SSO stamp when session cleanup removed the sessions', () => {
    expect(latestSignInAt(null, sso)).toEqual(sso)
  })

  it('uses the newer SSO stamp when it is later than the session row', () => {
    expect(latestSignInAt(sso, session)).toEqual(session)
  })

  it('accepts the string timestamps postgres-js returns for aggregates', () => {
    expect(latestSignInAt('2026-01-02T00:00:00.000Z', null)).toEqual(session)
  })

  it('returns null when the member has never signed in', () => {
    expect(latestSignInAt(null, null)).toBeNull()
    expect(latestSignInAt(undefined, undefined)).toBeNull()
  })

  it('ignores an unparseable timestamp instead of returning Invalid Date', () => {
    expect(latestSignInAt('not-a-date', sso)).toEqual(sso)
    expect(latestSignInAt('not-a-date', null)).toBeNull()
  })
})
