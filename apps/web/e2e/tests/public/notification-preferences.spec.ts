import { test, expect } from '@playwright/test'
import {
  clearSigninRateLimit,
  enableMagicLinkMethod,
  getNotificationPreferences,
} from '../../utils/db-helpers'
import { loginViaMagicLink } from '../../utils/access-helpers'

/**
 * The portal Preferences page: the notification matrix a visitor controls for
 * their own account.
 *
 * Nothing drove it. The portal-settings spec only proves an unauthenticated
 * visitor is redirected away; the matrix's own copy and save path had unit
 * coverage at best, and the page's autosave ("every toggle saves; a failure
 * reverts the switch") had none.
 *
 * Signs in as a fresh portal user per test through the magic-link seam, so the
 * starting preferences are the row better-auth creates on first sign-in.
 */
test.describe.configure({ mode: 'serial' })

test.describe('Portal notification preferences', () => {
  test.beforeAll(() => {
    enableMagicLinkMethod()
    clearSigninRateLimit()
  })

  test.afterAll(() => {
    clearSigninRateLimit()
  })

  async function openPreferences(
    browser: import('@playwright/test').Browser,
    baseURL: string | undefined,
    tag: string
  ) {
    const email = `e2e-prefs-${tag}-${Date.now()}@example.test`
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    await loginViaMagicLink(context, email)
    const page = await context.newPage()
    await page.goto('/settings/preferences')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible({
      timeout: 15_000,
    })
    return { context, page, email }
  }

  test('pausing all email saves and survives a reload', async ({ browser, baseURL }) => {
    test.setTimeout(90_000)
    const { context, page, email } = await openPreferences(browser, baseURL, 'pause')
    try {
      const pause = page.getByRole('switch', { name: 'Pause all email notifications' })
      await expect(pause).not.toBeChecked()

      await pause.click()
      await expect
        .poll(() => getNotificationPreferences(email).emailMuted, { timeout: 15_000 })
        .toBe(true)

      // The change is server-side, not just an optimistic switch.
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(
        page.getByRole('switch', { name: 'Pause all email notifications' })
      ).toBeChecked()

      await page.getByRole('switch', { name: 'Pause all email notifications' }).click()
      await expect
        .poll(() => getNotificationPreferences(email).emailMuted, { timeout: 15_000 })
        .toBe(false)
    } finally {
      await context.close()
    }
  })

  test('one cell can be turned off without touching the other channel', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    const { context, page, email } = await openPreferences(browser, baseURL, 'cell')
    try {
      // The Feedback tab is the matrix's default group.
      const emailSwitch = page.getByRole('switch', { name: 'Status changed - Email' })
      const inAppSwitch = page.getByRole('switch', { name: 'Status changed - In-app' })
      await expect(emailSwitch).toBeChecked()
      await expect(inAppSwitch).toBeChecked()

      await emailSwitch.click()
      await expect
        .poll(() => getNotificationPreferences(email).matrix?.post_status_changed?.email ?? true, {
          timeout: 15_000,
        })
        .toBe(false)
      // The in-app cell is a separate column and stays on.
      expect(getNotificationPreferences(email).matrix?.post_status_changed?.inApp ?? true).toBe(
        true
      )

      // Reload: the unchecked cell is what the server stored.
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('switch', { name: 'Status changed - Email' })).not.toBeChecked()
      await expect(page.getByRole('switch', { name: 'Status changed - In-app' })).toBeChecked()
    } finally {
      await context.close()
    }
  })
})
