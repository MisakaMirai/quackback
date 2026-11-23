import { test, expect, type Page } from '@playwright/test'
import {
  clearSigninRateLimit,
  enableMagicLinkMethod,
  getMagicLinkToken,
  getPortalInvitation,
} from '../../utils/db-helpers'
import { loginViaMagicLink, setPortalVisibility } from '../../utils/access-helpers'

/**
 * Portal-access invitations: an admin invites an address from the
 * portal-access settings page, the invitee opens the magic link the email
 * carries, and the accepted invitation is what lets them through a private
 * portal gate.
 *
 * Different invitation from the team kind (covered by team-invitation.spec):
 * `kind='portal'` grants a private-portal viewer, never a teammate, and it is
 * accepted at `/portal-invite/<id>`.
 *
 * Serial: the private-portal toggle is workspace state shared by both tests.
 */
test.describe.configure({ mode: 'serial' })

test.describe('Portal access invitations', () => {
  test.beforeAll(() => {
    enableMagicLinkMethod()
    clearSigninRateLimit()
    // The portal-access tab only offers email invites while the portal is
    // private (that is the access model these invites grant), and the first
    // test needs the gate to exist before the invite is accepted.
    setPortalVisibility('private')
  })

  test.afterAll(() => {
    setPortalVisibility('public')
    clearSigninRateLimit()
  })

  /** Invite `address` from the portal-access tab; asserts the invite row landed. */
  async function inviteFromPortalAccess(page: Page, address: string): Promise<void> {
    await page.goto('/admin/settings/security/authentication?tab=portal-access')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Invite users' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Email addresses to invite' }).fill(address)
    await dialog.getByRole('button', { name: 'Send invites' }).click()

    // The invitation row is written before the email leaves, so it exists
    // whether the transport accepted the message, is unconfigured (CI), or is
    // a failing SMTP relay (a local .env with credentials). The dialog either
    // closes on success or keeps the failed address for a retry; either way
    // the invite is live, which is what the invitee's side follows.
    await expect(page.getByText(/(Sent 1 invite\.|\d+ sent, \d+ failed\.)/).first()).toBeVisible({
      timeout: 30_000,
    })
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Cancel' }).click()
    }
    await expect(dialog).toBeHidden()
  }

  test('an accepted portal invite opens a private portal', async ({ browser, page, baseURL }) => {
    test.setTimeout(120_000)
    const address = `e2e-portal-invite-${Date.now()}@example.test`

    await inviteFromPortalAccess(page, address)
    const invite = getPortalInvitation(address)
    expect(invite.status).toBe('pending')

    // The anonymous visitor is behind the gate before the invite is used.
    const anonymous = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const gatePage = await anonymous.newPage()
    await gatePage.goto('/')
    await expect(gatePage.getByText(/this portal is private/i)).toBeVisible({ timeout: 15_000 })
    await anonymous.close()

    // The invitee follows the link the email carries: the magic-link verify
    // page forwards them to `/portal-invite/<id>`, which accepts and lands
    // them on the portal.
    const inviteeContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const invitee = await inviteeContext.newPage()
    try {
      const token = getMagicLinkToken(address)
      await invitee.goto(
        `/verify-magic-link?token=${encodeURIComponent(token)}` +
          `&callbackURL=${encodeURIComponent(`/portal-invite/${invite.invitationId}`)}`
      )
      await invitee.waitForLoadState('networkidle')

      // Like every invite link, this page asks the human to accept rather
      // than spending the token on a bare GET (mail scanners prefetch links).
      await expect(invitee.getByRole('heading', { name: "You're invited!" })).toBeVisible({
        timeout: 15_000,
      })
      await invitee.getByRole('button', { name: 'Accept invitation' }).click()

      // Accepting lands on the portal; with the invite accepted the private
      // portal gate lets this visitor through.
      await expect(invitee).toHaveURL(/\/$/, { timeout: 30_000 })
      await expect(invitee.getByText(/this portal is private/i)).toHaveCount(0)
      await expect(invitee.getByRole('heading', { name: /support/i }).first()).toBeVisible({
        timeout: 15_000,
      })

      // The invitation is spent, and accepting it is what the portal gate
      // read — not just the sign-in.
      await expect
        .poll(() => getPortalInvitation(address).status, { timeout: 15_000 })
        .toBe('accepted')
    } finally {
      await inviteeContext.close()
    }
  })

  test('a visitor signed in as another address cannot accept the invite', async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    const invited = `e2e-portal-invite-a-${Date.now()}@example.test`
    const other = `e2e-portal-invite-b-${Date.now()}@example.test`

    await inviteFromPortalAccess(page, invited)
    const invite = getPortalInvitation(invited)
    expect(invite.status).toBe('pending')

    // Sign in as a different person than the invite names, then open the
    // invite URL directly (the invite email's magic link would sign in as the
    // invited address, so this must be a separate session).
    const otherContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const otherPage = await otherContext.newPage()
    try {
      await loginViaMagicLink(otherContext, other)
      await otherPage.goto(`/portal-invite/${invite.invitationId}`)
      await expect(otherPage.getByRole('heading', { name: 'Wrong account' })).toBeVisible({
        timeout: 20_000,
      })

      // The mismatch did not consume the invitation.
      expect(getPortalInvitation(invited).status).toBe('pending')
    } finally {
      await otherContext.close()
    }
  })
})
