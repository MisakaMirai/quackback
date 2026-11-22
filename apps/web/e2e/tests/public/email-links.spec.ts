import { test, expect } from '@playwright/test'
import {
  mintCsatToken,
  readCsatState,
  readUnsubscribeState,
  seedConversation,
  seedUnsubscribeToken,
} from '../../utils/db-helpers'

/**
 * The emailed-link surfaces — `/unsubscribe` and `/csat`. Both are reached from
 * a mailbox with no session, so the link token is the only credential, and both
 * are deliberately **read-only on GET**: corporate mail scanners prefetch every
 * link in a message, so a page load that acted would silently unsubscribe or
 * overwrite a rating.
 *
 * Nothing covered either page before. The unit tests hold the token helpers and
 * the service functions; these drive the real pages and the one-click POST, and
 * read the database to prove that loading changes nothing and the human action
 * changes exactly one thing.
 *
 * Runs in the public project: no session, no stored state.
 */
const DEMO_EMAIL = 'demo@example.com'

// Shared demo-user preferences (the unsubscribe tests) and the rate at which
// the confirm click lands; serial keeps one test's baseline from racing another.
test.describe.configure({ mode: 'serial' })

test.describe('email link surfaces', () => {
  test('an unsubscribe link with no usable token shows the friendly error', async ({ page }) => {
    await page.goto('/unsubscribe')
    await expect(page.getByRole('heading', { name: 'This link is incomplete' })).toBeVisible()

    await page.goto('/unsubscribe?token=not-a-uuid')
    await expect(page.getByRole('heading', { name: 'This link is not valid' })).toBeVisible()
  })

  test('opening an unsubscribe link writes nothing until the button is pressed', async ({
    page,
  }) => {
    const { token } = seedUnsubscribeToken(DEMO_EMAIL, 'unsubscribe_all')
    const before = readUnsubscribeState(DEMO_EMAIL)
    expect(before.emailMuted).toBe(false)

    await page.goto(`/unsubscribe?token=${token}`)
    await expect(page.getByRole('heading', { name: 'Turn off all email?' })).toBeVisible()

    // The GET is the confirmation page: a prefetching scanner must not have
    // changed a thing.
    expect(readUnsubscribeState(DEMO_EMAIL)).toEqual(before)

    // Server-rendered page, client-side handler: a click before hydration is a
    // no-op, so press until the client's result view replaces the form.
    const done = page.getByRole('heading', { name: 'Done' })
    await expect(async () => {
      if (!(await done.isVisible())) {
        await page.getByRole('button', { name: 'Turn off all email' }).click()
      }
      await expect(done).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })
    await expect
      .poll(() => readUnsubscribeState(DEMO_EMAIL).emailMuted, { timeout: 10_000 })
      .toBe(true)

    // The token is spent as part of the action, so a reload cannot re-run it.
    await page.goto(`/unsubscribe?token=${token}`)
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
  })

  test('the RFC 8058 one-click POST unsubscribes without the page', async ({ request }) => {
    const { token } = seedUnsubscribeToken(DEMO_EMAIL, 'unsubscribe_all')
    expect(readUnsubscribeState(DEMO_EMAIL).emailMuted).toBe(false)

    const res = await request.post(`/unsubscribe?token=${token}`, {
      form: { 'List-Unsubscribe': 'One-Click' },
    })
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('OK')
    await expect
      .poll(() => readUnsubscribeState(DEMO_EMAIL).emailMuted, { timeout: 10_000 })
      .toBe(true)

    // A body that is not the RFC 8058 one is refused, so a bare POST to the
    // link URL from a page can never act as the recipient.
    const refused = await request.post(`/unsubscribe?token=${token}`, { form: { nope: '1' } })
    expect(refused.status()).toBe(400)
  })

  test('a CSAT link records nothing until a face is tapped', async ({ page }) => {
    const seeded = seedConversation(`E2E csat conversation ${Date.now()}`)
    const token = mintCsatToken(seeded.conversationId)
    expect(readCsatState(seeded.conversationId).csatRating).toBeNull()

    await page.goto(`/csat?token=${token}&rating=4`)
    await expect(page.getByRole('heading', { name: 'How did we do?' })).toBeVisible()

    // The `rating=4` link only preselects the face; the loader is read-only.
    expect(readCsatState(seeded.conversationId).csatRating).toBeNull()

    const thanks = page.getByRole('heading', { name: 'Thanks for the feedback' })
    await expect(async () => {
      if (!(await thanks.isVisible())) {
        await page.getByRole('button', { name: 'Rate 4 of 5' }).click()
      }
      await expect(thanks).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })
    await expect
      .poll(() => readCsatState(seeded.conversationId).csatRating, { timeout: 10_000 })
      .toBe(4)
  })

  test('a CSAT link with a bad token shows the expired state', async ({ page }) => {
    await page.goto('/csat')
    await expect(page.getByRole('heading', { name: 'Missing Link' })).toBeVisible()

    await page.goto('/csat?token=garbage')
    await expect(page.getByRole('heading', { name: 'Link Expired' })).toBeVisible()
  })
})
