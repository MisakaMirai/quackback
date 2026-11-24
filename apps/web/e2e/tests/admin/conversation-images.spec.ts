import { test, expect, type Page } from '@playwright/test'
import {
  setSupportSurfaces,
  seedConversation,
  seedFile,
  type SeededConversation,
} from '../../utils/db-helpers'
import {
  CHANGELOG_PNG,
  LEGACY_WIDE_PNG,
  PASTED_PNG,
  POST_PNG,
  expectLandscapeContainThumb,
  expectLoadedImage,
  landscapePng,
  pasteImageOn,
  stubConversationImageNetwork,
  stubFileUploads,
  stubStorageImage,
} from '../../utils/conversation-images'

/**
 * Open a conversation in the inbox.
 *
 * `/admin/inbox` is gated on the support inbox flag, and the flag the specs set
 * is written as raw SQL while the server keeps its settings copy for a few
 * seconds; a fresh seed also leaves the flag off. Reload until the inbox
 * actually renders the conversation instead of asserting on one load that may
 * still redirect to /admin/feedback.
 */
async function openConversation(
  page: Page,
  conversationId: string,
  firstMessage: string
): Promise<void> {
  await expect(async () => {
    await page.goto(`/admin/inbox?i=${conversationId}`)
    await expect(page.getByText(firstMessage).first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 45_000 })
}
test.describe('Admin conversation images', { tag: '@smoke' }, () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  let seeded: SeededConversation

  test.beforeAll(() => {
    setSupportSurfaces(true)
    seeded = seedConversation(`E2E conversation images ${Date.now()}`, undefined, {
      legacyImage: true,
    })
  })

  test('lifts a smashed inline screenshot to a contain thumb and zoom modal', async ({ page }) => {
    test.setTimeout(60_000)
    await stubConversationImageNetwork(page)
    await page.goto('/admin/inbox')

    const row = page.getByText(seeded.messages[1]).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(async () => {
      await row.click()
      await expect(page).toHaveURL(new RegExp(`i=${seeded.conversationId}`), { timeout: 2000 })
    }).toPass({ timeout: 15000 })

    const legacy = page.getByRole('button', { name: `Open ${LEGACY_WIDE_PNG}` })
    await expect(legacy).toBeVisible({ timeout: 10000 })
    await expectLandscapeContainThumb(legacy)
    await expect(page.locator(`img[width="500"][height="500"]`)).toHaveCount(0)

    await legacy.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('img', { name: LEGACY_WIDE_PNG })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('paste and paperclip stage the tray, then send a contain thumb', async ({ page }) => {
    test.setTimeout(60_000)
    const png = await stubConversationImageNetwork(page)
    // The composer uploads through the raw-body POST /api/upload/file contract
    // and the sent message rebuilds each attachment from its `files` row, so
    // seed the rows and stub both the upload and the storage GET (e2e has no
    // object store).
    const pastedFile = seedFile(`chat-images/${PASTED_PNG}`, 'pasted-shot.png')
    const paperclipFile = seedFile('chat-images/e2e-paperclip.png', 'paperclip.png')
    await stubFileUploads(page, [pastedFile, paperclipFile])
    await stubStorageImage(page, paperclipFile.storageKey)
    await openConversation(page, seeded.conversationId, seeded.messages[0])

    const composer = page.locator('[data-inbox-composer]')
    await expect(composer).toBeVisible()
    await pasteImageOn(composer, png, 'pasted-shot.png')

    const trayThumb = composer.getByRole('button', { name: 'Open pasted-shot.png' })
    await expect(trayThumb).toBeVisible({ timeout: 10000 })
    await expect(composer.locator('.ProseMirror img')).toHaveCount(0)

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Attach files' }).click(),
    ])
    await chooser.setFiles({
      name: 'paperclip.png',
      mimeType: 'image/png',
      buffer: landscapePng(),
    })
    await expect(composer.getByRole('button', { name: 'Open paperclip.png' })).toBeVisible({
      timeout: 10000,
    })

    // A message with a single image renders it aspect-preserved (object-contain);
    // two or more render a square object-cover grid. Drop the paperclip tile so
    // the sent reply keeps the single-image contain thumb this test is about.
    await composer.getByRole('button', { name: 'Remove paperclip.png' }).click()

    await page.getByRole('button', { name: 'Send reply' }).click()
    const sent = page
      .getByRole('button', { name: 'Open pasted-shot.png' })
      .filter({ has: page.locator('img.object-contain') })
    await expect(sent).toBeVisible({ timeout: 15000 })
    await expectLandscapeContainThumb(sent)
    await sent.click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Zoom in' })).toBeVisible()
  })
})

test.describe('Changelog images stay inline', () => {
  test('paste in a changelog entry inserts an editor image, not a chat tray', async ({ page }) => {
    test.setTimeout(45_000)
    const png = await stubConversationImageNetwork(page)
    await page.goto('/admin/changelog')
    const newEntry = page.getByRole('button', { name: /new entry/i })
    await expect(newEntry.first()).toBeVisible({ timeout: 15000 })
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      if (!(await dialog.isVisible().catch(() => false))) {
        await newEntry.first().click()
      }
      await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })

    const editor = dialog.locator('.ProseMirror[contenteditable="true"]')
    await editor.click()
    await pasteImageOn(editor, png, 'changelog-shot.png')

    await expect(editor.locator(`img[src*="${CHANGELOG_PNG}"]`)).toBeVisible({ timeout: 10000 })
    // The changelog editor keeps the image inline: no chat-tray tile for it.
    await expect(dialog.getByRole('button', { name: 'Remove changelog-shot.png' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Open changelog-shot.png' })).toHaveCount(0)
  })
})

test.describe('Post images stay inline', () => {
  test('paste in a new post inserts an editor image, not a chat tray', async ({ page }) => {
    test.setTimeout(45_000)
    const png = await stubConversationImageNetwork(page)
    await page.goto('/admin/feedback')
    await expect(page.getByRole('heading', { name: 'Feedback', level: 2 })).toBeVisible({
      timeout: 15000,
    })
    const create = page.getByRole('button', { name: 'New post' })
    await expect(create).toBeVisible()
    await expect(async () => {
      if (
        !(await page
          .getByRole('dialog')
          .isVisible()
          .catch(() => false))
      ) {
        await create.click()
      }
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    const dialog = page.getByRole('dialog')

    const editor = dialog.locator('.ProseMirror[contenteditable="true"]')
    await editor.click()
    await pasteImageOn(editor, png, 'post-shot.png')

    await expect(editor.locator(`img[src*="${POST_PNG}"]`)).toBeVisible({ timeout: 10000 })
    // The post editor keeps the image inline: no chat-tray tile for it.
    await expect(dialog.getByRole('button', { name: 'Remove post-shot.png' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Open post-shot.png' })).toHaveCount(0)
  })
})

test.describe('Conversation attachment storage', () => {
  // /admin/inbox is gated on the support inbox flag, which a fresh seed leaves
  // off — without this the inbox redirects to /admin/feedback and the seeded
  // conversation is never on screen.
  test.beforeAll(() => {
    setSupportSurfaces(true)
  })

  test('sec-fetch-dest:image hits the storage route, not Vite Cannot GET', async ({ request }) => {
    const res = await request.get('/api/storage/chat-images/e2e-missing.png', {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
      },
    })
    const body = await res.text()
    expect(body).not.toMatch(/Cannot GET/i)
    expect(res.headers()['content-type'] ?? '').toMatch(/json|image/)
    expect(res.status()).not.toBe(404)
  })

  test('a sent paste thumb still decodes after a full page refresh', async ({ page }) => {
    test.setTimeout(60_000)
    const seeded = seedConversation(`E2E real paste refresh ${Date.now()}`)
    const png = landscapePng()
    // Not a real-object-storage test: e2e has no object store, so the files row
    // is seeded, the upload POST is stubbed (current /api/upload/file contract)
    // and the storage GET is stubbed with the same fixture. What is real is the
    // round trip being asserted — the attachment's stored URL is re-minted from
    // the row and still decodes after a full reload.
    const realFile = seedFile('chat-images/e2e-real-refresh.png', 'real-refresh.png')
    await stubFileUploads(page, [realFile])
    await stubStorageImage(page, realFile.storageKey)
    await openConversation(page, seeded.conversationId, seeded.messages[0])

    const composer = page.locator('[data-inbox-composer]')
    await expect(composer).toBeVisible()
    await pasteImageOn(composer, png, 'real-refresh.png')

    const trayThumb = composer.getByRole('button', { name: 'Open real-refresh.png' })
    await expect(trayThumb).toBeVisible({ timeout: 15000 })
    await expectLoadedImage(trayThumb.locator('img'))
    await expect(composer.locator('.ProseMirror img')).toHaveCount(0)

    await page.getByRole('button', { name: 'Send reply' }).click()
    const sent = page
      .getByRole('button', { name: 'Open real-refresh.png' })
      .filter({ has: page.locator('img.object-contain') })
    await expect(sent).toBeVisible({ timeout: 15000 })
    await expectLoadedImage(sent.locator('img'))
    await expectLandscapeContainThumb(sent)

    await page.reload()
    await expect(page.getByText(seeded.messages[0]).first()).toBeVisible({ timeout: 15000 })
    const afterReload = page
      .getByRole('button', { name: 'Open real-refresh.png' })
      .filter({ has: page.locator('img.object-contain') })
    await expect(afterReload).toBeVisible({ timeout: 15000 })
    await expectLoadedImage(afterReload.locator('img'))
    await expectLandscapeContainThumb(afterReload)
    // It is still an image button after the reload, not the old filename-chip
    // link. (The conversation's Files rail does legitimately expose a
    // "Download …" link, so scope the check to the message itself.)
    const messageRow = page
      .locator('[data-message-id]')
      .filter({ has: page.getByRole('button', { name: 'Open real-refresh.png' }) })
    await expect(messageRow.getByRole('link', { name: /real-refresh\.png/i })).toHaveCount(0)
  })
})
