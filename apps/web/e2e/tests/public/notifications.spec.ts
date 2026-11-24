import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect } from '@playwright/test'

test.describe('Portal Notifications (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notifications')
    await waitForNetworkIdle(page)
  })

  test('redirects away from /notifications when not logged in', async ({ page }) => {
    // The portal layout should bounce unauthenticated users away from /notifications
    // or render the page but gate the content behind an auth prompt.
    // Either way the current URL must not remain /notifications, OR a login trigger
    // is visible on the page.
    const url = page.url()
    const isOnNotifications = url.includes('/notifications')

    if (!isOnNotifications) {
      // Hard redirect path: the portal home is the only sensible landing spot.
      // Single-workspace routing — the old acme.localhost:3000 host check is gone.
      expect(new URL(url).pathname).toBe('/')
    } else {
      // Soft-gate path: page renders but only shows a login prompt, not notification
      // content. Check that neither the notifications heading nor any notification
      // rows are visible without first logging in.
      const heading = page.getByRole('heading', { name: /notifications/i })
      const loginTrigger = page.getByRole('button', { name: /log in|sign in|sign up/i })
      const isHeadingVisible = (await heading.count()) > 0 && (await heading.isVisible())

      // Unauthenticated users must NOT see the notifications content heading.
      // NOTE: this currently fails — /notifications renders its shell (heading,
      // tabs) for anonymous visitors while every /settings/* portal page
      // redirects them home. Reported as a suspected product bug, not worked
      // around here.
      expect(isHeadingVisible).toBe(false)

      // No heading rendered — auth gate in place
      await expect(loginTrigger.first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows Log in and Sign up buttons on the portal header when unauthenticated', async ({
    page,
  }) => {
    // Even if we were redirected, navigate home so the header is definitely visible
    const url = page.url()
    if (!url.includes('/notifications')) {
      // Already redirected — check header on current page
    } else {
      await page.goto('/')
      await waitForNetworkIdle(page)
    }

    const logInButton = page.getByRole('button', { name: /log in/i })
    const signUpButton = page.getByRole('button', { name: /sign up/i })

    await expect(logInButton.first()).toBeVisible({ timeout: 10000 })
    await expect(signUpButton.first()).toBeVisible({ timeout: 10000 })
  })

  test('notification bell icon is not shown when unauthenticated', async ({ page }) => {
    // The NotificationBell component is only rendered for logged-in users
    await page.goto('/')
    await waitForNetworkIdle(page)

    // The bell sits next to the avatar; it should be absent for anonymous visitors
    const bell = page.locator('[aria-label*="notification" i], [data-testid*="notification-bell"]')
    if ((await bell.count()) > 0) {
      await expect(bell.first()).not.toBeVisible()
    }
  })
})
