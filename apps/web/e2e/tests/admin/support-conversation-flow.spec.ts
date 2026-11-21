import { test, expect } from '@playwright/test'
import {
  clearSigninRateLimit,
  enableMagicLinkMethod,
  seedConversation,
  setSupportSurfaces,
} from '../../utils/db-helpers'
import { loginViaMagicLink } from '../../utils/access-helpers'

/**
 * The support conversation flow, end to end across the two surfaces:
 * a signed-in visitor starts a thread on the portal, the team answers it in
 * the unified inbox, and the visitor reads that answer back on their own
 * Support page.
 *
 * Neither side was covered for *creation* before: `public/portal-support.spec.ts`
 * lists a DB-seeded conversation, and `admin/inbox.spec.ts` opens a DB-seeded
 * one. Everything in between — the composer's first-send POST, the thread the
 * portal navigates to afterwards, and the inbox row that send produces — was
 * untested.
 */
test.describe('Support conversation flow', { tag: '@smoke' }, () => {
  // The Properties aside is `hidden min-[1680px]:flex`; pin a desktop size.
  test.use({ viewport: { width: 1920, height: 1080 } })

  test.beforeAll(() => {
    enableMagicLinkMethod()
    setSupportSurfaces(true)
    clearSigninRateLimit()
  })

  test('visitor starts a conversation, the agent replies, the visitor reads it', async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    const stamp = Date.now()
    const email = `e2e-support-flow-${stamp}@example.test`
    const firstMessage = `Visitor message from e2e ${stamp}`
    const agentReply = `Agent reply from e2e ${stamp}`

    // A second, isolated browser context for the visitor: the test's own
    // `page` carries the stored admin session, which must not leak in.
    const visitorContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const visitor = await visitorContext.newPage()

    try {
      await loginViaMagicLink(visitorContext, email)

      // 1. Portal: the visitor opens a fresh thread and sends the first message.
      await visitor.goto('/support')
      await visitor.getByRole('link', { name: /new conversation/i }).click()
      await expect(visitor).toHaveURL(/\/support\/new$/)

      const visitorComposer = visitor.locator('.ProseMirror[contenteditable="true"]')
      await visitorComposer.click()
      await visitorComposer.fill(firstMessage)
      await visitor.getByRole('button', { name: 'Send' }).click()

      // The first send creates the conversation and the page replaces
      // /support/new with its real id, so a refresh resumes the thread.
      await expect(visitor).toHaveURL(/\/support\/conversation_/, { timeout: 20_000 })
      await expect(visitor.getByText(firstMessage).first()).toBeVisible({ timeout: 10_000 })

      // 2. Inbox: the same message is the row preview; opening it shows the thread.
      await page.goto('/admin/inbox')
      const row = page.getByText(firstMessage).first()
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(async () => {
        await row.click()
        await expect(page).toHaveURL(/i=conversation_/, { timeout: 2000 })
      }).toPass({ timeout: 15_000 })

      // 3. Inbox: the agent replies in the thread.
      const agentComposer = page.locator('.ProseMirror[contenteditable="true"]')
      await agentComposer.click()
      await agentComposer.fill(agentReply)
      await page.getByRole('button', { name: 'Send reply' }).click()
      await expect(page.getByText(agentReply).first()).toBeVisible({ timeout: 10_000 })

      // 4. Portal: a refresh shows the agent's answer in the visitor's thread.
      await visitor.reload()
      await expect(visitor.getByText(agentReply).first()).toBeVisible({ timeout: 20_000 })
    } finally {
      await visitorContext.close()
    }
  })

  test('a closed conversation reopens when the visitor replies', async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    const stamp = Date.now()
    const email = `e2e-support-reopen-${stamp}@example.test`
    const visitorContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const visitor = await visitorContext.newPage()

    try {
      // The conversation is bound to this address, so the account must exist
      // first: sign in, then seed the thread it owns.
      await loginViaMagicLink(visitorContext, email)
      const seeded = seedConversation(`E2E reopen conversation ${stamp}`, email)
      await visitor.goto(`/support/${seeded.conversationId}`)
      await expect(visitor.getByText(seeded.messages[1]).first()).toBeVisible({ timeout: 15_000 })

      // Agent closes the conversation from the inbox detail panel.
      await page.goto('/admin/inbox')
      await page.goto(`/admin/inbox?i=${seeded.conversationId}`)
      const panel = page.getByRole('complementary', { name: 'Item details' })
      await expect(panel).toBeVisible({ timeout: 15_000 })
      // The status control is client-rendered: the first click can land on
      // inert server HTML before hydration, so retry until the menu opens.
      const statusButton = panel.getByRole('button', { name: 'open', exact: true })
      await expect(async () => {
        await statusButton.click()
        await expect(page.getByRole('menuitem', { name: 'closed' })).toBeVisible({ timeout: 1500 })
      }).toPass({ timeout: 20_000 })
      await page.getByRole('menuitem', { name: 'closed' }).click()
      await expect(panel.getByRole('button', { name: 'closed', exact: true })).toBeVisible({
        timeout: 10_000,
      })

      // Visitor sees the closed hint, then reopens with a reply.
      await visitor.reload()
      await expect(
        visitor.getByText(/this conversation was closed\. reply to reopen it/i)
      ).toBeVisible({ timeout: 15_000 })
      const replyText = `Reopen message from e2e ${stamp}`
      const composer = visitor.locator('.ProseMirror[contenteditable="true"]')
      await composer.click()
      await composer.fill(replyText)
      await visitor.getByRole('button', { name: 'Send' }).click()
      await expect(visitor.getByText(replyText).first()).toBeVisible({ timeout: 15_000 })

      // The team side sees it open again. Re-navigate inside the retry: a
      // single load can render the pre-reopen thread from the route's
      // server payload, and only a fresh request picks up the new status.
      await expect(async () => {
        await page.goto(`/admin/inbox?i=${seeded.conversationId}`)
        await expect(panel.getByRole('button', { name: 'open', exact: true })).toBeVisible({
          timeout: 3000,
        })
      }).toPass({ timeout: 30_000 })
    } finally {
      await visitorContext.close()
    }
  })
})
