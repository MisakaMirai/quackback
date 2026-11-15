/**
 * The audience stamped on a session as Better Auth creates it.
 *
 * There is one anonymous audience — the portal — so every `/sign-in/anonymous`
 * mint is tagged portal, whichever client asked for it.
 */
import { describe, expect, it, vi } from 'vitest'

// The client-supplied forwarding header must not decide the recorded address;
// the socket peer does (no trusted proxy hops here).
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
  getRequestIP: () => '203.0.113.5',
}))

import { assignSessionScope } from '../session-audience'

const base = { userId: 'user_anon', token: 'tok', expiresAt: new Date(0) }

function ctx(path: string, headers: Record<string, string> = {}) {
  return { path, headers: new Headers(headers) }
}

describe('assignSessionScope', () => {
  it('tags the anonymous mint as portal', async () => {
    const result = await assignSessionScope(base, ctx('/sign-in/anonymous'))
    expect(result).toEqual({ data: { ...base, scope: 'portal', ipAddress: '203.0.113.5' } })
  })

  it('tags the anonymous mint as portal even when the context carries no header bag', async () => {
    const result = await assignSessionScope(base, { path: '/sign-in/anonymous' })
    expect(result?.data.scope).toBe('portal')
  })

  it('records the resolved peer address on the anonymous mint, for the anonymous vote limit', async () => {
    const result = await assignSessionScope(
      { ...base, ipAddress: '1.2.3.4' },
      ctx('/sign-in/anonymous', { 'x-forwarded-for': '1.2.3.4' })
    )
    expect(result?.data.ipAddress).toBe('203.0.113.5')
  })

  it('leaves non-anonymous sign-ins at the column default', async () => {
    for (const path of ['/sign-in/email', '/sign-in/social', '/callback/:id']) {
      expect(await assignSessionScope(base, ctx(path))).toBeUndefined()
    }
    expect(await assignSessionScope(base, null)).toBeUndefined()
  })
})
