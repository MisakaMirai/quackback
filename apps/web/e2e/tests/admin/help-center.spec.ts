import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * Help Center admin E2E tests.
 *
 * These tests cover the help center article management UI at /admin/help-center.
 *
 * The article list and the article editor now share one route: creating an
 * article opens a dialog on the list, and "Save draft" opens the new article in
 * the editor modal addressed by the `?article=<id>` search param. (The former
 * full-page editor route, /admin/help-center/articles/<id>, now just redirects
 * to that modal.) The editor's metadata sidebar is a pane of the modal, so
 * publishing/unpublishing happens there and "Save changes" closes the modal.
 *
 * Prerequisites:
 *   - The `helpCenter` product flag must be enabled in Settings > General.
 *
 * The suite enables the flag before each test via `enableHelpCenter`. The flag
 * persists, so only the first test in the file actually flips the switch.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_PATH = '/admin/help-center'
const SEARCH_PLACEHOLDER = 'Search articles...'

/** The create-article dialog; its accessible name is the sr-only dialog title. */
function createArticleDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Create help article' })
}

/** The article editor modal; its accessible name is the sr-only dialog title. */
function editorDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Edit article' })
}

/** Enable the Help Center module with its switch on the General settings page. */
async function enableHelpCenter(page: Page): Promise<void> {
  await page.goto('/admin/settings/general')

  const toggle = page.getByRole('switch', { name: 'Help Center' })
  await expect(toggle).toBeVisible({ timeout: 15000 })
  if (await toggle.isChecked()) return

  await toggle.click()
  // A click that lands before hydration is swallowed; the switch updates
  // optimistically, so wait for the checked state and click once more if the
  // press never registered.
  await expect(toggle)
    .toBeChecked({ timeout: 5000 })
    .catch(() => toggle.click())
  await expect(toggle).toBeChecked({ timeout: 10000 })

  // The module's nav entries (admin sidebar and settings nav) are driven by the
  // feature flags in the root route context, which the autosave refreshes
  // asynchronously. Their appearance is the signal that /admin/help-center will
  // open instead of redirecting to the first enabled product.
  await expect(page.getByRole('link', { name: 'Help center' }).first()).toBeVisible({
    timeout: 20000,
  })
}

/**
 * Open the article list and wait for its toolbar.
 * No networkidle waits: the admin shell holds SSE streams open, so the network
 * never goes idle.
 */
async function openList(page: Page): Promise<void> {
  await page.goto(LIST_PATH)
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 15000 })
}

/** Select the first available category in the editor's combobox, if any exist. */
async function selectFirstCategoryIfAvailable(dialog: Locator, page: Page): Promise<void> {
  const trigger = dialog.locator('[role="combobox"]').first()
  if ((await trigger.count()) === 0) return
  await trigger.click()
  const firstOption = page.getByRole('option').first()
  try {
    await firstOption.waitFor({ state: 'visible', timeout: 2000 })
    await firstOption.click()
  } catch {
    // No categories in this workspace yet: the article saves into General.
    await page.keyboard.press('Escape')
  }
}

/**
 * Create a fresh article via the dialog (saving it as a draft) and return the
 * editor URL. Saving as a draft opens the article in the editor modal.
 */
async function createAndOpenArticle(
  page: Page,
  title = `Editor Test Article ${Date.now()}`
): Promise<string> {
  await enableHelpCenter(page)
  await openList(page)

  await page.getByRole('button', { name: 'New article' }).first().click()
  const dialog = createArticleDialog(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })

  await dialog.getByPlaceholder('Article title').fill(title)
  await selectFirstCategoryIfAvailable(dialog, page)

  await dialog.locator('.ProseMirror[contenteditable="true"]').click()
  await page.keyboard.type('Test article content for e2e test.')

  await dialog.getByRole('button', { name: /save draft/i }).click()
  await expect(dialog).toBeHidden({ timeout: 20000 })
  await expect(page).toHaveURL(/[?&]article=article_[^&]+/, { timeout: 20000 })

  await expect(editorDialog(page)).toBeVisible({ timeout: 20000 })
  return page.url()
}

/** Publish the open article with the status control in the editor sidebar. */
async function publishArticle(page: Page): Promise<void> {
  const editor = editorDialog(page)
  const draftStatus = editor.getByRole('button', { name: /^draft$/i })
  await expect(draftStatus).toBeVisible({ timeout: 15000 })
  await draftStatus.click()
  await expect(editor.getByRole('button', { name: /^published$/i })).toBeVisible({
    timeout: 20000,
  })
}

/** The editor modal is closed and the URL no longer addresses an article. */
async function expectEditorClosed(page: Page): Promise<void> {
  await expect(editorDialog(page)).toBeHidden({ timeout: 20000 })
  await expect(page).toHaveURL(
    (url) => url.pathname === LIST_PATH && !url.searchParams.has('article')
  )
}

/** The modal's header close (X) button. */
function editorCloseButton(page: Page): Locator {
  return editorDialog(page).locator('header button').first()
}

// ---------------------------------------------------------------------------
// Navigation suite
// ---------------------------------------------------------------------------

test.describe('Help Center admin navigation', () => {
  test('can navigate to help center from admin sidebar', async ({ page }) => {
    await enableHelpCenter(page)

    await page.goto('/admin')
    const helpCenterLink = page.getByRole('link', { name: 'Help center' }).first()
    await expect(helpCenterLink).toBeVisible({ timeout: 15000 })
    await helpCenterLink.click()

    await expect(page).toHaveURL(/\/admin\/help-center/, { timeout: 15000 })
  })

  test('help center index shows article list area', async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)

    // The list area reads either its empty state or the article count line.
    await expect(page.getByText(/No articles yet|\d+ articles?/).first()).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole('button', { name: 'New article' }).first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Category creation
// ---------------------------------------------------------------------------

test.describe('Help Center category management', () => {
  test.beforeEach(async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)
  })

  test('offers New article in the header and New category in the pane', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New article' }).first()).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('button', { name: 'New category' })).toBeVisible()
  })

  test('can create a new top-level category', async ({ page }) => {
    await page.getByRole('button', { name: 'New category' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })

    const categoryName = `E2E Category ${Date.now()}`
    await dialog.getByLabel('Name', { exact: true }).fill(categoryName)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(dialog).toBeHidden({ timeout: 15000 })
    await expect(page.getByText(categoryName, { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })
  })
})

// ---------------------------------------------------------------------------
// Article creation
// ---------------------------------------------------------------------------

test.describe('Help Center article creation', () => {
  test.beforeEach(async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)
  })

  test('can open create article dialog from the New article button', async ({ page }) => {
    await page.getByRole('button', { name: 'New article' }).first().click()

    const dialog = createArticleDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByPlaceholder('Article title')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 10000 })
  })

  test('can create an article with title and content, then navigate to editor', async ({
    page,
  }) => {
    const url = await createAndOpenArticle(page, `E2E Test Article ${Date.now()}`)
    // Saving a draft opens the editor modal on the list route.
    expect(url).toMatch(/[?&]article=article_/)
  })

  test('create article dialog can be dismissed with Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'New article' }).first().click()

    const dialog = createArticleDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// Article editor (modal)
// ---------------------------------------------------------------------------

test.describe('Help Center article editor', () => {
  test('editor shows title input, description input, and content area', async ({ page }) => {
    await createAndOpenArticle(page)
    const editor = editorDialog(page)

    // The title field's placeholder is "Article title" in the editor too (it
    // used to read "Untitled" on the old full-page editor).
    await expect(editor.getByPlaceholder('Article title')).toBeVisible({ timeout: 15000 })
    await expect(editor.getByPlaceholder('Page description (optional)')).toBeVisible()
    await expect(editor.locator('.ProseMirror[contenteditable="true"]')).toBeVisible()
  })

  test('editor has category select, status control and Save changes button', async ({ page }) => {
    await createAndOpenArticle(page)
    const editor = editorDialog(page)

    await expect(editor.getByRole('combobox').first()).toBeVisible({ timeout: 15000 })

    // Publishing is a status toggle in the metadata sidebar ("Draft" toggles to
    // "Published"); there is no footer Publish button in the editor modal.
    await expect(editor.getByRole('button', { name: /^draft$/i })).toBeVisible()

    await expect(editor.getByRole('button', { name: /save changes/i })).toBeVisible()
  })

  test('can edit the article title and save', async ({ page }) => {
    await createAndOpenArticle(page)
    const editor = editorDialog(page)

    const newTitle = `Updated Title ${Date.now()}`
    await editor.getByPlaceholder('Article title').fill(newTitle)
    const save = editor.getByRole('button', { name: /save changes/i })
    await expect(save).toBeEnabled()
    await save.click()

    // Saving closes the modal and the list reflects the new title.
    await expectEditorClosed(page)
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible({ timeout: 15000 })
  })

  test('can edit article description', async ({ page }) => {
    await createAndOpenArticle(page)
    const editor = editorDialog(page)

    const description = 'A helpful description set by Playwright.'
    await expect(editor.getByPlaceholder('Page description (optional)')).toBeVisible({
      timeout: 15000,
    })
    await editor.getByPlaceholder('Page description (optional)').fill(description)
    await editor.getByRole('button', { name: /save changes/i }).click()

    await expectEditorClosed(page)
    // The list row previews the description once it is saved.
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15000 })
  })

  test('can publish an article and see the View button', async ({ page }) => {
    await createAndOpenArticle(page)
    await publishArticle(page)

    // A published article exposes the header's View action for the public page.
    await expect(editorDialog(page).getByRole('button', { name: /^view$/i })).toBeVisible({
      timeout: 15000,
    })
  })

  test('can unpublish a published article via the status control', async ({ page }) => {
    await createAndOpenArticle(page)
    await publishArticle(page)

    // The metadata sidebar's status control is the publish/unpublish toggle.
    const editor = editorDialog(page)
    await editor.getByRole('button', { name: /^published$/i }).click()

    await expect(editor.getByRole('button', { name: /^draft$/i })).toBeVisible({ timeout: 20000 })
    await expect(editor.getByRole('button', { name: /^view$/i })).toBeHidden()
  })

  test('close button returns to the help center list', async ({ page }) => {
    await createAndOpenArticle(page)

    // The editor is a modal: its header close button returns to the list.
    await editorCloseButton(page).click()

    await expectEditorClosed(page)
  })
})

// ---------------------------------------------------------------------------
// Article author (metadata sidebar)
// ---------------------------------------------------------------------------

test.describe('Help Center article author', () => {
  /**
   * Author changes are exposed through the REST API and MCP tools, which require
   * a Bearer API key. These tests verify the UI display path: the editor's
   * metadata sidebar names the article's author and survives a reload.
   */

  test('article list renders without errors when articles exist', async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)

    const articleRows = page.locator('div.group:has(h3)')
    if ((await articleRows.count()) === 0) {
      await expect(page.getByText('No articles yet')).toBeVisible()
      return
    }

    await expect(articleRows.first().locator('h3')).toBeVisible()
  })

  test('article editor shows the author and stays stable after a reload', async ({ page }) => {
    const url = await createAndOpenArticle(page)
    const editor = editorDialog(page)

    await page.reload()
    await expect(editor).toBeVisible({ timeout: 20000 })

    // The metadata sidebar's author row names the article's creator.
    await expect(editor.getByText('Author', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(editor.getByPlaceholder('Article title')).not.toHaveValue('')
    expect(page.url()).toBe(url)
  })
})

// ---------------------------------------------------------------------------
// Article list filtering
// ---------------------------------------------------------------------------

test.describe('Help Center article filtering', () => {
  test.beforeEach(async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)
  })

  test('search input is present', async ({ page }) => {
    const searchInput = page.locator('[data-search-input]')
    await expect(searchInput).toBeVisible({ timeout: 10000 })
    await expect(searchInput).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER)
  })

  test('sort dropdown is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^sort: newest/i })).toBeVisible({
      timeout: 10000,
    })
  })

  test('can change sort order', async ({ page }) => {
    const sortTrigger = page.getByRole('button', { name: /^sort: newest/i })
    await expect(sortTrigger).toBeVisible({ timeout: 10000 })

    await sortTrigger.click()
    await page.getByRole('menuitemradio', { name: /oldest/i }).click()

    await expect(page.getByRole('button', { name: /^sort: oldest/i })).toBeVisible({
      timeout: 10000,
    })
  })
})

// ---------------------------------------------------------------------------
// Article editor toolbar formatting
// ---------------------------------------------------------------------------

test.describe('Help Center article editor toolbar', () => {
  test('bubble menu appears when text is selected', async ({ page }) => {
    await createAndOpenArticle(page, `Toolbar Test ${Date.now()}`)
    const editor = editorDialog(page).locator('.ProseMirror[contenteditable="true"]')
    await expect(editor).toBeVisible({ timeout: 15000 })

    await editor.click()
    await page.keyboard.type('Hello formatting world')
    await editor.press('Control+a')

    // The floating bubble menu labels its buttons with the shortcut, which is
    // how it is told apart from the always-present toolbar buttons.
    await expect(page.getByRole('button', { name: /^Bold \(/ })).toBeVisible({ timeout: 10000 })
  })

  test('bold shortcut (Ctrl+B) toggles bold in editor', async ({ page }) => {
    await createAndOpenArticle(page, `Bold Test ${Date.now()}`)
    const editor = editorDialog(page).locator('.ProseMirror[contenteditable="true"]')
    await expect(editor).toBeVisible({ timeout: 15000 })

    await editor.click()
    await page.keyboard.type('bold text')
    await editor.press('Control+a')
    await editor.press('Control+b')

    // Text should now be wrapped in a <strong> tag
    await expect(editor.locator('strong')).toBeVisible({ timeout: 5000 })
  })

  test('italic shortcut (Ctrl+I) toggles italic in editor', async ({ page }) => {
    await createAndOpenArticle(page, `Italic Test ${Date.now()}`)
    const editor = editorDialog(page).locator('.ProseMirror[contenteditable="true"]')
    await expect(editor).toBeVisible({ timeout: 15000 })

    await editor.click()
    await page.keyboard.type('italic text')
    await editor.press('Control+a')
    await editor.press('Control+i')

    await expect(editor.locator('em')).toBeVisible({ timeout: 5000 })
  })

  test('slash command menu opens when "/" is typed at start of line', async ({ page }) => {
    await createAndOpenArticle(page, `Slash Menu Test ${Date.now()}`)
    const editor = editorDialog(page).locator('.ProseMirror[contenteditable="true"]')
    await expect(editor).toBeVisible({ timeout: 15000 })

    // Start a fresh, empty block, then type the trigger character.
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')

    // The slash menu lists block types (Text, Heading 1, …).
    await expect(page.getByText('Heading 1', { exact: true })).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')
  })
})

// ---------------------------------------------------------------------------
// Article SEO / description field
// ---------------------------------------------------------------------------

test.describe('Help Center article SEO description', () => {
  test('description field value is persisted after save and page reload', async ({ page }) => {
    const url = await createAndOpenArticle(page, `SEO Test ${Date.now()}`)
    const editor = editorDialog(page)

    const description = `SEO description set at ${Date.now()}`
    await editor.getByPlaceholder('Page description (optional)').fill(description)
    await editor.getByRole('button', { name: /save changes/i }).click()
    await expectEditorClosed(page)

    // Saving closes the modal; reopening the article by URL shows the stored value.
    await page.goto(url)
    await expect(editor.getByPlaceholder('Page description (optional)')).toHaveValue(description, {
      timeout: 20000,
    })
  })

  test('description field is trimmed on save (leading/trailing whitespace)', async ({ page }) => {
    const url = await createAndOpenArticle(page, `Trim Test ${Date.now()}`)
    const editor = editorDialog(page)

    await editor.getByPlaceholder('Page description (optional)').fill('  trimmed description  ')
    await editor.getByRole('button', { name: /save changes/i }).click()
    await expectEditorClosed(page)

    // The server trims on save, so the reopened article shows the trimmed value.
    await page.goto(url)
    await expect(editor.getByPlaceholder('Page description (optional)')).toHaveValue(
      'trimmed description',
      { timeout: 20000 }
    )
  })
})

// ---------------------------------------------------------------------------
// Article list filtering — status and search
// ---------------------------------------------------------------------------

test.describe('Help Center article list filtering - status', () => {
  test.beforeEach(async ({ page }) => {
    await enableHelpCenter(page)
    await openList(page)
  })

  test('"Filter" button opens filter popover with Status and Category options', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Filter', exact: true }).click()

    const menu = page.locator('[data-slot="popover-content"]')
    await expect(menu.getByRole('button', { name: 'Status', exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(menu.getByRole('button', { name: 'Category', exact: true })).toBeVisible()
  })

  test('can apply Draft status filter', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    const menu = page.locator('[data-slot="popover-content"]')
    await menu.getByRole('button', { name: 'Status', exact: true }).click()

    // Status sub-menu shows Draft and Published
    await expect(menu.getByRole('button', { name: 'Draft', exact: true })).toBeVisible({
      timeout: 10000,
    })
    await menu.getByRole('button', { name: 'Draft', exact: true }).click()

    // A Status: Draft chip replaces the filter entry with its remove action.
    await expect(page.getByRole('button', { name: 'Remove Status Draft filter' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/[?&]status=draft/)
  })

  test('can apply Published status filter', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    const menu = page.locator('[data-slot="popover-content"]')
    await menu.getByRole('button', { name: 'Status', exact: true }).click()

    await expect(menu.getByRole('button', { name: 'Published', exact: true })).toBeVisible({
      timeout: 10000,
    })
    await menu.getByRole('button', { name: 'Published', exact: true }).click()

    await expect(page.getByRole('button', { name: 'Remove Status Published filter' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page).toHaveURL(/[?&]status=published/)
  })

  test('status filter chip can be removed', async ({ page }) => {
    // Apply a Draft filter
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    const menu = page.locator('[data-slot="popover-content"]')
    await menu.getByRole('button', { name: 'Status', exact: true }).click()
    await menu.getByRole('button', { name: 'Draft', exact: true }).click()

    // Filter chips render their own remove button, named after the filter.
    const removeButton = page.getByRole('button', { name: 'Remove Status Draft filter' })
    await expect(removeButton).toBeVisible({ timeout: 10000 })
    await removeButton.click()

    await expect(removeButton).toBeHidden({ timeout: 10000 })
    await expect(page).not.toHaveURL(/status=/)
  })

  test('searching in the admin list shows matching articles', async ({ page }) => {
    // Create an article with a unique title so we can search for it
    const uniqueTitle = `SearchTarget ${Date.now()}`
    await createAndOpenArticle(page, uniqueTitle)

    // Return to the list
    await page.goto(LIST_PATH)
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 15000 })

    await page.locator('[data-search-input]').fill(uniqueTitle)

    // The article should appear in the list
    await expect(page.getByRole('heading', { name: uniqueTitle })).toBeVisible({ timeout: 15000 })
  })

  test('searching with no matches shows "No articles match your search" empty state', async ({
    page,
  }) => {
    const searchInput = page.locator('[data-search-input]')
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('xyznonexistentarticlexyz98765')

    await expect(
      page
        .getByText('No articles match your search')
        .or(page.getByText('No articles match your filters'))
    ).toBeVisible({ timeout: 15000 })
  })
})

// ---------------------------------------------------------------------------
// Article preview — the header's View action
// ---------------------------------------------------------------------------

test.describe('Help Center article preview link', () => {
  test('"View" button opens the canonical /hc/{locale}/articles/{id}-{slug} path', async ({
    page,
    context,
  }) => {
    await createAndOpenArticle(page, `Preview Test ${Date.now()}`)
    await publishArticle(page)

    // The header's View action opens the article in a new tab.
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      editorDialog(page)
        .getByRole('button', { name: /^view$/i })
        .click(),
    ])

    // Verify the URL is the canonical locale-prefixed article URL
    await expect(popup).toHaveURL(/\/hc\/[^/]+\/articles\/[^/]+$/, { timeout: 20000 })
    await popup.close()
  })

  test('"View" button opens the article in a new tab', async ({ page, context }) => {
    await createAndOpenArticle(page, `NewTab Test ${Date.now()}`)
    await publishArticle(page)

    const adminUrl = page.url()
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      editorDialog(page)
        .getByRole('button', { name: /^view$/i })
        .click(),
    ])

    await expect(popup).toHaveURL(/\/hc\/[^/]+\/articles\//, { timeout: 20000 })
    // The admin tab keeps the article open behind the new tab.
    expect(page.url()).toBe(adminUrl)
    await popup.close()
  })

  test('"View" button is not shown for draft articles', async ({ page }) => {
    await createAndOpenArticle(page, `Draft Link Test ${Date.now()}`)
    const editor = editorDialog(page)

    // Article is in draft state after creation — no View action yet.
    await expect(editor.getByRole('button', { name: /^view$/i })).toBeHidden()

    // The status control offers publishing instead.
    await expect(editor.getByRole('button', { name: /^draft$/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Article list item — context menu
// ---------------------------------------------------------------------------

test.describe('Help Center article list item actions', () => {
  test('article row shows ellipsis menu with Edit and Delete options on hover', async ({
    page,
  }) => {
    // Guarantees the list has at least one row to act on.
    await createAndOpenArticle(page)
    await page.keyboard.press('Escape')
    await expectEditorClosed(page)

    const firstRow = page.locator('div.group:has(h3)').first()
    await expect(firstRow).toBeVisible({ timeout: 15000 })

    // Hover to reveal the ellipsis button (the row's only button).
    await firstRow.hover()
    await firstRow.locator('button').last().click()

    await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
  })
})
