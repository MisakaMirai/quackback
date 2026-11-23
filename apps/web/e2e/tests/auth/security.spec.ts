/**
 * Security e2e — the sign-in flows the API-level security fixes depend on.
 *
 * The rest of `tests/auth/` proves the sign-in *journeys* (unified dialog, SSO
 * routing, portal gate); the unit suites prove the helpers. Nothing drove the
 * real HTTP surface end to end, so the properties below were assumed:
 *
 *  1. A magic link signs in exactly once; the token is dead afterwards.
 *  2. A tampered session cookie is rejected, not "healed" into a session.
 *  3. Signing out revokes server-side — replaying the old cookie fails.
 *  4. An external `callbackURL` is refused instead of redirecting off-origin.
 *  5. The fourth magic-link send for one address inside the window is 429.
 *  6. A cross-origin POST is rejected (CSRF/Origin) and cannot end a session.
 *  7. The session cookie is HttpOnly, SameSite=Lax with a seven-day lifetime.
 *
 * Each test mints its own magic link through `POST /api/auth/sign-in/magic-link`
 * and reads the token straight from the verification table, the same seam
 * `global-setup` uses. Specs here run in the `chromium-auth` project, which has
 * no stored state and no dependency on `setup`, so the magic-link method and
 * its rate-limit buckets are provisioned here.
 */
import { test, expect, type BrowserContext, type APIRequestContext } from '@playwright/test'
import {
  clearSigninRateLimit,
  enableMagicLinkMethod,
  getMagicLinkToken,
} from '../../utils/db-helpers'

const SESSION_COOKIE = 'better-auth.session_token'

/**
 * Serial: the rate-limit buckets are shared per client IP, and the bucket reset
 * in the throttling test must not race the other tests' sends.
 */
test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  enableMagicLinkMethod()
  clearSigninRateLimit()
})

test.afterAll(() => {
  // Leave no spend behind for the next spec in this worker.
  clearSigninRateLimit()
})

/** A unique address per test, so one test's bucket never throttles another. */
function uniqueEmail(tag: string): string {
  return `e2e-security-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

/** Ask for a magic link and return the bare token from the verification row. */
async function sendMagicLink(request: APIRequestContext, email: string): Promise<string> {
  const send = await request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/' },
  })
  expect(send.ok(), `magic-link send for ${email}`).toBeTruthy()
  const token = getMagicLinkToken(email)
  expect(token.length).toBeGreaterThan(8)
  return token
}

/**
 * Complete the link in `context` and assert it produced a live session.
 * Returns the token that was consumed, so a caller can prove reuse fails.
 */
async function signIn(context: BrowserContext, email: string): Promise<string> {
  const token = await sendMagicLink(context.request, email)
  const verify = await context.request.get(
    `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`
  )
  expect(verify.status(), 'magic-link verify').toBeLessThan(400)
  expect(await getSession(context.request)).not.toBeNull()
  return token
}

/** The session payload, or null once the request carries no valid session. */
async function getSession(request: APIRequestContext): Promise<unknown> {
  const res = await request.get('/api/auth/get-session')
  expect(res.ok()).toBeTruthy()
  return res.json()
}

/** Flip one character inside the token half of `value.<signature>`. */
function tamperSessionValue(value: string): string {
  const at = 4
  const original = value[at]
  const replacement = original === 'A' ? 'B' : 'A'
  return `${value.slice(0, at)}${replacement}${value.slice(at + 1)}`
}

test('(1) a magic link signs in once and is refused on reuse', async ({ browser, baseURL }) => {
  const email = uniqueEmail('reuse')
  const first = await browser.newContext({ baseURL })
  const reused = await browser.newContext({ baseURL })
  try {
    const token = await signIn(first, email)

    // Same token, fresh context: the verification row was consumed by the
    // first verify, so Better-Auth answers with the failed-verify redirect.
    const replay = await reused.request.get(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`
    )
    expect(new URL(replay.url()).searchParams.get('error')).toBe('INVALID_TOKEN')
    expect(await getSession(reused.request)).toBeNull()
  } finally {
    await first.close()
    await reused.close()
  }
})

test('(2) a tampered session cookie is rejected', async ({ browser, baseURL }) => {
  const email = uniqueEmail('tamper')
  const signedIn = await browser.newContext({ baseURL })
  const forged = await browser.newContext({ baseURL })
  try {
    await signIn(signedIn, email)
    const cookie = (await signedIn.cookies()).find((c) => c.name.startsWith(SESSION_COOKIE))
    expect(cookie, 'session cookie after sign-in').toBeTruthy()

    await forged.addCookies([
      { name: cookie!.name, value: tamperSessionValue(cookie!.value), url: baseURL! },
    ])

    // The HMAC no longer covers the token, so the forged cookie buys nothing:
    // no session, and the admin boundary still bounces to the sign-in dialog.
    expect(await getSession(forged.request)).toBeNull()
    const page = await forged.newPage()
    await page.goto('/admin')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('auth')).toBe('signin')
  } finally {
    await signedIn.close()
    await forged.close()
  }
})

test('(3) signing out revokes the session and the old cookie cannot be replayed', async ({
  browser,
  baseURL,
}) => {
  const email = uniqueEmail('revoke')
  const signedIn = await browser.newContext({ baseURL })
  const replay = await browser.newContext({ baseURL })
  try {
    await signIn(signedIn, email)
    const cookie = (await signedIn.cookies()).find((c) => c.name.startsWith(SESSION_COOKIE))
    expect(cookie).toBeTruthy()

    // Same-origin POST, as the browser sends it.
    const out = await signedIn.request.post('/api/auth/sign-out', {
      headers: { Origin: new URL(baseURL!).origin },
      data: {},
    })
    expect(out.ok()).toBeTruthy()
    expect(await getSession(signedIn.request)).toBeNull()

    // Server-side revocation: the value that worked a moment ago is dead even
    // in a fresh context, so "log out" is not just a cleared browser cookie.
    await replay.addCookies([{ name: cookie!.name, value: cookie!.value, url: baseURL! }])
    expect(await getSession(replay.request)).toBeNull()
    const page = await replay.newPage()
    await page.goto('/admin')
    expect(new URL(page.url()).searchParams.get('auth')).toBe('signin')
  } finally {
    await signedIn.close()
    await replay.close()
  }
})

test('(4) an external callbackURL is refused instead of redirecting off-origin', async ({
  browser,
  baseURL,
}) => {
  const email = uniqueEmail('redirect')
  const context = await browser.newContext({ baseURL })
  try {
    const token = await sendMagicLink(context.request, email)
    const verify = await context.request.get(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}` +
        `&callbackURL=${encodeURIComponent('https://evil.example/steal')}`
    )

    // Better-Auth's trusted-origin check refuses the redirect outright; no
    // Location header points at the attacker, and no session is minted.
    expect(verify.status()).toBe(403)
    expect(verify.headers()['location'] ?? '').not.toContain('evil.example')
    expect(await getSession(context.request)).toBeNull()
  } finally {
    await context.close()
  }
})

test('(5) the fourth magic-link send for one address is rate-limited', async ({
  browser,
  baseURL,
}) => {
  // Start from empty buckets: this test asserts the window's exact shape.
  clearSigninRateLimit()
  const email = uniqueEmail('ratelimit')
  const context = await browser.newContext({ baseURL })
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const send = await context.request.post('/api/auth/sign-in/magic-link', {
        data: { email, callbackURL: '/' },
      })
      expect(send.status(), `send ${attempt} within budget`).toBe(200)
    }

    // 3/15min per (ip, email): the next one is refused with the same JSON shape
    // the unified form renders, plus the retry hint.
    const blocked = await context.request.post('/api/auth/sign-in/magic-link', {
      data: { email, callbackURL: '/' },
    })
    expect(blocked.status()).toBe(429)
    expect((await blocked.json()).code).toBe('rate_limited')
    expect(blocked.headers()['retry-after']).toMatch(/^\d+$/)
  } finally {
    await context.close()
    clearSigninRateLimit()
  }
})

test('(6) cross-origin POSTs are rejected and cannot end a session', async ({
  browser,
  baseURL,
}) => {
  const evil = { Origin: 'https://evil.example' }
  const email = uniqueEmail('csrf')
  const context = await browser.newContext({ baseURL })
  try {
    const send = await context.request.post('/api/auth/sign-in/magic-link', {
      headers: evil,
      data: { email, callbackURL: '/' },
    })
    expect(send.status()).toBe(403)
    expect((await send.json()).code).toBe('INVALID_ORIGIN')

    await signIn(context, email)
    const out = await context.request.post('/api/auth/sign-out', {
      headers: evil,
      data: {},
    })
    expect(out.status()).toBe(403)
    // The cross-origin attempt changed nothing: the real session survives.
    expect(await getSession(context.request)).not.toBeNull()
  } finally {
    await context.close()
  }
})

test('(7) the session cookie is HttpOnly, SameSite=Lax and lasts seven days', async ({
  browser,
  baseURL,
}) => {
  const email = uniqueEmail('cookie')
  const context = await browser.newContext({ baseURL })
  try {
    await signIn(context, email)
    const cookie = (await context.cookies()).find((c) => c.name.startsWith(SESSION_COOKIE))
    expect(cookie).toBeTruthy()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite).toBe('Lax')
    expect(cookie!.path).toBe('/')
    // Max-Age is seven days; allow a minute of clock drift during the exchange.
    const remainingMs = cookie!.expires * 1000 - Date.now()
    expect(remainingMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 60 * 1000)
  } finally {
    await context.close()
  }
})
