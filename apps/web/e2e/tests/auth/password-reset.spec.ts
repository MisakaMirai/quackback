import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect } from '@playwright/test'
import { clearSigninRateLimit, enableMagicLinkMethod, getResetToken } from '../../utils/db-helpers'
import { loginViaMagicLink } from '../../utils/access-helpers'

/**
 * The password-reset surface: the request endpoint, the emailed page, and the
 * credential it leaves behind.
 *
 * The reset link is a bearer credential for an account: whoever has it can set
 * the password. Nothing covered it end to end — the page had no test at all,
 * and the request endpoint's uniform answer (the anti-enumeration property the
 * sign-in surfaces also hold) was assumed rather than pinned.
 *
 * Runs in the `chromium-auth` project (no stored state), so it provisions the
 * magic-link method it uses to create the accounts and clears the sign-in
 * buckets itself.
 */
test.describe.configure({ mode: 'serial' })

const NEW_PASSWORD = 'e2e-reset-password-1'

test.beforeAll(() => {
  enableMagicLinkMethod()
  clearSigninRateLimit()
})

test.afterAll(() => {
  clearSigninRateLimit()
})

function uniqueEmail(tag: string): string {
  return `e2e-reset-${tag}-${Date.now()}@example.test`
}

/** POST the reset request the sign-in form posts, with a browser-like Origin. */
async function requestReset(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  origin: string
): Promise<import('@playwright/test').APIResponse> {
  return request.post('/api/auth/request-password-reset', {
    headers: { Origin: origin },
    data: { email, redirectTo: '/auth/reset-password' },
  })
}

test('(1) the reset request answers the same for unknown and known addresses', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin
  const known = await requestReset(request, 'demo@example.com', origin)
  const unknown = await requestReset(request, uniqueEmail('unknown'), origin)

  // Same status and same body: the answer must not tell a caller whether the
  // address has an account (the reset email is the only channel that does).
  expect(known.status()).toBe(200)
  expect(unknown.status()).toBe(known.status())
  expect(await unknown.json()).toEqual(await known.json())
})

test('(2) the form only enables its submit once the password is long enough and repeated', async ({
  page,
}) => {
  // With no token the page is inert: both fields and the submit are disabled.
  await page.goto('/auth/reset-password')
  await expect(page.getByLabel('New password')).toBeDisabled()

  await page.goto('/auth/reset-password?token=not-a-live-token')
  // The form is server-rendered and the fields are controlled: wait for the
  // client to finish hydrating, or the values never reach React's state.
  await waitForNetworkIdle(page)
  const password = page.getByLabel('New password')
  const confirm = page.getByLabel('Confirm password')
  const submit = page.getByRole('button', { name: 'Reset password' })

  await password.fill('short')
  await confirm.fill('short')
  await expect(submit).toBeDisabled()

  await password.fill(NEW_PASSWORD)
  await confirm.fill('different-password-1')
  await expect(submit).toBeDisabled()

  await confirm.fill(NEW_PASSWORD)
  await expect(submit).toBeEnabled()
})

test('(3) a reset link sets the password once, then the credential signs in', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000)
  const origin = new URL(baseURL!).origin
  const email = uniqueEmail('happy')

  // Create the account the reset is for (magic link auto-creates on first use).
  const userContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  })
  const page = await userContext.newPage()
  try {
    await loginViaMagicLink(userContext, email)

    const resetRequest = await requestReset(userContext.request, email, origin)
    expect(resetRequest.ok()).toBeTruthy()
    const token = getResetToken(email)

    // The emailed page: set the new password.
    await page.goto(`/auth/reset-password?token=${token}`)
    await waitForNetworkIdle(page)
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
    const submitted = page.getByRole('heading', { name: 'Password reset' })
    await expect(async () => {
      if (!(await submitted.isVisible())) {
        await page.getByRole('button', { name: 'Reset password' }).click()
      }
      await expect(submitted).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByText('Your password has been updated successfully.')).toBeVisible()

    // The credential works in a brand-new context (nothing from the old one).
    const fresh = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    try {
      const signIn = await fresh.request.post('/api/auth/sign-in/email', {
        headers: { Origin: origin },
        data: { email, password: NEW_PASSWORD },
      })
      expect(signIn.ok(), 'password sign-in after reset').toBeTruthy()
      expect(
        await fresh.request.get('/api/auth/get-session').then((res) => res.json())
      ).not.toBeNull()
    } finally {
      await fresh.close()
    }

    // The token was spent by that reset: a second visit cannot set another
    // password with it.
    const replay = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    try {
      const replayPage = await replay.newPage()
      await replayPage.goto(`/auth/reset-password?token=${token}`)
      await waitForNetworkIdle(replayPage)
      await replayPage.getByLabel('New password').fill('another-password-1')
      await replayPage.getByLabel('Confirm password').fill('another-password-1')
      const failure = replayPage.getByText(/invalid|expired/i)
      await expect(async () => {
        if (!(await failure.isVisible())) {
          await replayPage.getByRole('button', { name: 'Reset password' }).click()
        }
        await expect(failure).toBeVisible({ timeout: 3000 })
      }).toPass({ timeout: 20_000 })
      await expect(replayPage.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    } finally {
      await replay.close()
    }
  } finally {
    await userContext.close()
  }
})
