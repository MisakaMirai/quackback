import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect, type Page } from '@playwright/test'
import { getTeamInvitation } from '../../utils/db-helpers'

/**
 * The team invitation flow, end to end: an admin invites an address from the
 * Members page, the invitee opens the emailed link, completes sign-up, and
 * lands in the product as a teammate.
 *
 * The members-page spec stops at the dialog (it fills an address, then
 * cancels), so nothing covered delivering the invite, the invitee's side of
 * it, or the acceptance that turns a pending invitation into a member.
 *
 * In e2e the email transport is not configured, so the add-people dialog hands
 * back the invitation link to share by hand — the exact link the email would
 * carry, which is what the invitee opens below.
 */
test.describe('Team invitation flow', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  /** Invite `address` from the Members page; returns the link the dialog shows. */
  async function inviteFromMembersPage(page: Page, address: string): Promise<string> {
    await page.goto('/admin/settings/members')
    await waitForNetworkIdle(page)

    await page.getByRole('button', { name: /add people/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('combobox', { name: 'People' }).fill(address)
    await dialog.getByRole('option', { name: `Invite ${address}` }).click()

    const inviteButton = dialog.getByRole('button', { name: /^invite 1 person$/i })
    await expect(inviteButton).toBeEnabled()
    await inviteButton.click()

    // Email is unconfigured here, so the dialog switches to the share-link view
    // instead of claiming an email went out. That view carries the real link.
    await expect(dialog.getByText(/email is not set up/i)).toBeVisible({ timeout: 20_000 })
    const link = (await dialog.locator('code').first().innerText()).trim()
    expect(link).toContain('/verify-magic-link?')

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
    return link
  }

  test('an invited address accepts from the emailed link and becomes a teammate', async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    const stamp = Date.now()
    const address = `e2e-team-invite-${stamp}@example.test`
    const inviteeName = `E2E Invitee ${stamp}`

    const link = await inviteFromMembersPage(page, address)
    expect(getTeamInvitation(address).status).toBe('pending')

    // The invitation's caller-specific context: a clean browser with no
    // session, opening the link exactly as the invitee would.
    const inviteeContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const invitee = await inviteeContext.newPage()
    try {
      await invitee.goto(link)
      await waitForNetworkIdle(invitee)

      // The invite link deliberately does not auto-verify: it is a page that
      // asks the human to accept (email scanners prefetch every link), so the
      // token is only spent on this click.
      await expect(invitee.getByRole('heading', { name: "You're invited!" })).toBeVisible({
        timeout: 15_000,
      })
      await invitee.getByRole('button', { name: 'Accept invitation' }).click()

      await expect(invitee).toHaveURL(/\/complete-signup\/invite_/, { timeout: 20_000 })
      await waitForNetworkIdle(invitee)

      // Signed in by the invite's magic link → the set-up form, not the
      // "sign in to accept" state.
      await expect(invitee.getByRole('heading', { name: 'Welcome!' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(invitee.getByLabel('Your name')).toBeVisible()
      // The address is fixed by the invite and rendered as the hidden username
      // field (password managers need it); it is not on-screen copy.
      await expect(invitee.locator('input[name="email"]')).toHaveValue(address)

      await invitee.getByLabel('Your name').fill(inviteeName)
      await invitee.getByRole('button', { name: 'Get started' }).click()

      // Accepting sends the teammate into the product.
      await expect(invitee).toHaveURL(/\/admin/, { timeout: 30_000 })
    } finally {
      await inviteeContext.close()
    }

    // The invitation is spent and the address is now a teammate.
    await expect.poll(() => getTeamInvitation(address).status, { timeout: 15_000 }).toBe('accepted')
    await page.reload()
    await waitForNetworkIdle(page)
    await expect(page.getByText(inviteeName).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(address).first()).toBeVisible({ timeout: 15_000 })
  })

  test('the invite page asks an anonymous visitor to sign in first', async ({
    browser,
    page,
    baseURL,
  }) => {
    const address = `e2e-team-preview-${Date.now()}@example.test`
    const link = await inviteFromMembersPage(page, address)
    expect(getTeamInvitation(address).status).toBe('pending')

    // Take the invitation id out of the link's callbackURL instead of using the
    // link itself: opening the link would sign the visitor in.
    const callback = new URL(link).searchParams.get('callbackURL')
    expect(callback, 'invite link carries a callbackURL').toBeTruthy()
    const invitationId = new URL(callback!).pathname.split('/').pop()
    expect(invitationId).toMatch(/^invite_/)

    const anonymous = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const visitor = await anonymous.newPage()
    try {
      await visitor.goto(`/complete-signup/${invitationId}`)
      await expect(visitor.getByRole('heading', { name: "You're invited!" })).toBeVisible({
        timeout: 15_000,
      })
      await expect(visitor.getByRole('link', { name: 'Sign in' })).toBeVisible()
      // Still anonymous: the invite page is a preview, not a grant.
      expect(
        await visitor.request.get('/api/auth/get-session').then((res) => res.json())
      ).toBeNull()
    } finally {
      await anonymous.close()
    }
  })
})
