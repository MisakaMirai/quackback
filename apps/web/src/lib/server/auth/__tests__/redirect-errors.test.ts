import { describe, it, expect } from 'vitest'
import {
  detectAuthBlockRedirect,
  AuthBlockedError,
  AUTH_BLOCK_MESSAGES,
  type AuthBlockCode,
} from '../redirect-errors'

describe('detectAuthBlockRedirect', () => {
  it('returns null for a non-redirected response', () => {
    expect(
      detectAuthBlockRedirect({
        redirected: false,
        url: 'https://t.example/api/auth/sign-in/email',
      })
    ).toBeNull()
  })

  it('returns null when the redirect lands somewhere other than the login pages', () => {
    expect(
      detectAuthBlockRedirect({ redirected: true, url: 'https://t.example/dashboard' })
    ).toBeNull()
  })

  it('returns null when the login page carries no error param (a normal redirect)', () => {
    expect(
      detectAuthBlockRedirect({ redirected: true, url: 'https://t.example/admin/login' })
    ).toBeNull()
  })

  it('translates password_method_not_allowed into a magic-link/SSO hint', () => {
    const err = detectAuthBlockRedirect({
      redirected: true,
      url: 'https://t.example/admin/login?error=password_method_not_allowed',
    })
    expect(err).toBeInstanceOf(AuthBlockedError)
    expect(err?.code).toBe('password_method_not_allowed')
    expect(err?.message).toMatch(/此工作区未启用密码登录/)
  })

  it('also fires for the portal login path', () => {
    const err = detectAuthBlockRedirect({
      redirected: true,
      url: 'https://t.example/auth/login?error=rate_limited',
    })
    expect(err?.code).toBe('rate_limited')
    expect(err?.message).toMatch(/登录尝试次数过多/)
  })

  it('detects a block on the canonical /?auth=signin&error=<code> destination', () => {
    const err = detectAuthBlockRedirect({
      redirected: true,
      url: 'https://t.example/?auth=signin&error=verified_domain_requires_sso',
    })
    expect(err).toBeInstanceOf(AuthBlockedError)
    expect(err?.code).toBe('verified_domain_requires_sso')
    expect(err?.message).toMatch(/单点登录/)
  })

  it('returns null for a plain / with no error param', () => {
    expect(detectAuthBlockRedirect({ redirected: true, url: 'https://t.example/' })).toBeNull()
  })

  it('returns null for an unknown error code (no generic fallback)', () => {
    expect(
      detectAuthBlockRedirect({
        redirected: true,
        url: 'https://t.example/admin/login?error=brand_new_invented_code',
      })
    ).toBeNull()
  })

  it('tolerates a malformed url instead of throwing', () => {
    expect(detectAuthBlockRedirect({ redirected: true, url: 'not-a-url' })).toBeNull()
  })
})

/**
 * Codes Better-Auth itself emits, taken from the installed 1.6.16 source rather
 * than from memory. Detection is code-based, so a code the map does not list
 * renders NOTHING — the page shows a login form with no explanation, which is
 * indistinguishable from the link having silently failed.
 *
 * `failed_to_create_user` is the realistic one: `plugins/magic-link/index.mjs`
 * redirects with it whenever user creation is refused, which is what an invitee
 * clicking a link after their invitation expired now gets.
 */
describe('detectAuthBlockRedirect — the codes Better-Auth actually emits', () => {
  it.each([
    ['failed_to_create_user', /无法通过该链接创建账户/],
    ['unable_to_create_user', /创建账户时出错/],
    ['unable_to_create_session', /登录时出错/],
  ])('renders a reason for %s', (code, expected) => {
    const err = detectAuthBlockRedirect({
      redirected: true,
      url: `https://t.example/auth/login?error=${code}`,
    })
    expect(err).toBeInstanceOf(AuthBlockedError)
    expect(err?.code).toBe(code)
    expect(err?.message).toMatch(expected)
  })
})

describe('AUTH_BLOCK_MESSAGES', () => {
  it('covers the migrated admin-only codes', () => {
    for (const code of [
      'token_expired',
      'signup_disabled',
      'OAUTH_CALLBACK_ERROR',
      'not_team_member',
    ] as AuthBlockCode[]) {
      expect(AUTH_BLOCK_MESSAGES[code]).toBeTruthy()
    }
  })

  it('explains Better-Auth user_info_is_missing for both missing profile and mapped email', () => {
    expect(AUTH_BLOCK_MESSAGES.user_info_is_missing).toMatch(/可用的个人资料/)
    expect(AUTH_BLOCK_MESSAGES.user_info_is_missing).toMatch(/邮箱/)
    expect(AUTH_BLOCK_MESSAGES.user_info_is_missing).toMatch(/映射/)
  })

  it('keeps both email-mismatch spellings after the 1.7 rename', () => {
    expect(AUTH_BLOCK_MESSAGES.email_does_not_match).toMatch(/邮箱与你的账户不一致/)
    expect(AUTH_BLOCK_MESSAGES["email_doesn't_match"]).toBe(
      AUTH_BLOCK_MESSAGES.email_does_not_match
    )
  })
})
