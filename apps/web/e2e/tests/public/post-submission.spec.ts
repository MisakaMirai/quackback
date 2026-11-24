import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect, Page, BrowserContext } from '@playwright/test'
import { loginViaMagicLink } from '../../utils/access-helpers'
import { enableMagicLinkMethod, clearSigninRateLimit } from '../../utils/db-helpers'

const TEST_EMAIL = 'demo@example.com'

// Configure test to run serially (no parallelization)
// This prevents sign-in rate-limit races across different describe blocks
test.describe.configure({ mode: 'serial' })

/**
 * Authenticate the page's browser context through the magic-link flow that
 * global setup and the rest of the suite use.
 *
 * Magic link is opt-in per workspace and the seed leaves it off; the admin
 * project's global setup enables it, but a public-only run does not depend on
 * that project, so provision it here. The per-address sign-in budget (3 sends
 * per 15 minutes) is cleared too — the legacy OTP send this replaced spent it
 * and then span until the file's beforeAll timed out before a single test ran.
 */
async function loginWithMagicLink(page: Page) {
  enableMagicLinkMethod()
  clearSigninRateLimit()
  await loginViaMagicLink(page.context(), TEST_EMAIL)

  // Session cookie is set on the context by the verify redirect; confirm the
  // portal renders for the signed-in visitor.
  await page.goto('/')
  await waitForNetworkIdle(page)

  // Verify we're on the home page (portal); URL may include query params like ?sort=top
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/?(\?.*)?$/, { timeout: 10000 })
}

// Global variables to share context and page across all tests
let globalContext: BrowserContext
let globalPage: Page

// Set up authentication once for the entire file
test.beforeAll(async ({ browser }) => {
  globalContext = await browser.newContext()
  globalPage = await globalContext.newPage()
  await loginWithMagicLink(globalPage)
})

// Clean up after all tests in the file
test.afterAll(async () => {
  await globalPage.close()
  await globalContext.close()
})

test.describe('Public Post Submission', () => {
  test.beforeEach(async () => {
    // Navigate to home for each test
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)
  })

  test('can open submit post form', async () => {
    // Find and click the "What's on your mind?" input to expand the form
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await expect(createPostInput).toBeVisible({ timeout: 10000 })
    await createPostInput.click()

    // Form should expand - verify by checking for rich text editor
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })
  })

  test('form has correct placeholder text', async () => {
    // Expand the form by clicking the input
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Verify title placeholder is visible
    await expect(createPostInput).toBeVisible({ timeout: 5000 })

    // Verify editor is visible
    // TipTap renders placeholder via CSS ::before pseudo-element, so we check for the editor element
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })
  })

  test('can format feedback details as headings', async () => {
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor.click()
    await globalPage.keyboard.type('Heading test')
    await globalPage.getByRole('button', { name: 'Heading 2' }).click()

    await expect(editor.locator('h2')).toHaveText('Heading test')
  })

  test('can close form with Cancel button', async () => {
    // Expand the form
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for form to expand
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Click Cancel button
    const cancelButton = globalPage.getByRole('button', { name: /^cancel$/i })
    await cancelButton.click()

    // Form should collapse - editor should no longer be visible
    await expect(editor).not.toBeVisible({ timeout: 5000 })
  })

  test('can close form with Escape key', async () => {
    // Expand the form
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for form to expand
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Press Escape key
    await globalPage.keyboard.press('Escape')

    // Form should collapse - editor should no longer be visible
    await expect(editor).not.toBeVisible({ timeout: 5000 })
  })

  test('form resets on close and reopen via Escape', async () => {
    // Expand the form
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Fill in some data
    await createPostInput.fill('Test Title')

    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor.click()
    await globalPage.keyboard.type('Test description content')

    // Close the form with Escape
    await globalPage.keyboard.press('Escape')
    await expect(editor).not.toBeVisible({ timeout: 5000 })

    // Reopen the form
    await createPostInput.click()
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Form should be empty (reset happens on collapse)
    await expect(createPostInput).toHaveValue('')

    // Editor should be empty (check if it has the empty class)
    const editorParagraph = editor.locator('p').first()
    await expect(editorParagraph).toHaveClass(/is-editor-empty/)
  })

  test('title input is auto-focused on open', async () => {
    // Open the dialog
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for dialog to open
    await globalPage.waitForTimeout(500) // Small delay for focus to settle

    // Title input should have focus
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    await expect(titleInput).toBeFocused({ timeout: 5000 })
  })

  test('shows error when submitting without title', async () => {
    // Open the dialog
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for dialog to open
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Don't fill anything, just click Submit
    const submitButton = globalPage.getByRole('button', { name: /^post$/i })
    await submitButton.click()

    // Error message should appear
    const errorMessage = globalPage.locator('.bg-destructive\\/10')
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    await expect(errorMessage).toContainText('Please add a title')
  })

  test('submitting without a description is allowed (details are optional)', async () => {
    // The composer no longer requires a description: only the title is
    // validated, and a post with no details is created from its title alone.
    await globalPage.getByRole('button', { name: /^New$/i }).click()
    await waitForNetworkIdle(globalPage)

    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Fill only the title
    const uniqueTitle = `Title-only post ${Date.now()}`
    await globalPage.getByPlaceholder("What's on your mind?").fill(uniqueTitle)

    // Click Post without filling the description
    await globalPage.getByRole('button', { name: /^post$/i }).click()

    // It succeeds rather than showing a validation error.
    await expect(globalPage.getByText('Feedback submitted')).toBeVisible({ timeout: 10000 })
    await expect(globalPage.getByRole('heading', { name: uniqueTitle })).toBeVisible({
      timeout: 10000,
    })
  })

  test('can submit a basic post', async () => {
    // Open the dialog
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for dialog to open
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Fill in the title
    await titleInput.fill('E2E Test Post')

    // Fill in the description (must use keyboard.type for TipTap)
    await editor.click()
    await globalPage.keyboard.type('This is a test post description created by E2E tests.')

    // Click Submit
    const submitButton = globalPage.getByRole('button', { name: /^post$/i })
    await submitButton.click()

    // Dialog should close after successful submission
    await expect(editor).not.toBeVisible({ timeout: 10000 })
  })

  test('new post appears in the list after submission', async () => {
    // First switch to "New" sort so new posts appear at top
    const newSortButton = globalPage.getByRole('button', { name: /^New$/i })
    await newSortButton.click()
    await waitForNetworkIdle(globalPage)

    // Generate a unique title to identify our post
    const uniqueTitle = `E2E Test Post ${Date.now()}`

    // Open the dialog
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await createPostInput.click()

    // Wait for dialog to open
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Fill in the form
    await titleInput.fill(uniqueTitle)

    await editor.click()
    await globalPage.keyboard.type('This post should appear in the feed after submission.')

    // Submit the post
    const submitButton = globalPage.getByRole('button', { name: /^post$/i })
    await submitButton.click()

    // Wait for dialog to close - router.refresh() should update the feed automatically
    await expect(editor).not.toBeVisible({ timeout: 10000 })

    // The new post should be visible in the list WITHOUT any manual refresh
    // (The component calls router.refresh() after successful submission)
    const newPost = globalPage.getByRole('heading', { name: uniqueTitle })
    await expect(newPost).toBeVisible({ timeout: 10000 })
  })
})

// Phase 1.5: Board Selector Tests
test.describe('Board Selector', () => {
  test.beforeEach(async () => {
    // Navigate to home for each test
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)
  })

  test('board selector is visible in dialog header', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Board selector should be visible (look for the select trigger)
    const boardSelector = globalPage.locator('[role="combobox"]')
    await expect(boardSelector).toBeVisible()
  })

  test('board selector shows default board name', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Board selector should show a board name (not just "Select board")
    const boardSelector = globalPage.locator('[role="combobox"]')
    await expect(boardSelector).not.toHaveText('Select board')
  })

  test('can open board selector dropdown', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Click the board selector to open dropdown
    const boardSelector = globalPage.locator('[role="combobox"]')
    await boardSelector.click()

    // Dropdown should be visible with options
    const selectContent = globalPage.locator('[role="listbox"]')
    await expect(selectContent).toBeVisible({ timeout: 5000 })
  })

  test('can select a different board', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Get initial board name
    const boardSelector = globalPage.locator('[role="combobox"]')
    const initialBoardName = await boardSelector.textContent()

    // Click to open dropdown
    await boardSelector.click()

    // Wait for dropdown to be visible
    const selectContent = globalPage.locator('[role="listbox"]')
    await expect(selectContent).toBeVisible({ timeout: 5000 })

    // Click on a different board option (if available)
    const options = globalPage.locator('[role="option"]')
    const optionCount = await options.count()

    if (optionCount > 1) {
      // Find an option that's different from the current one
      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i)
        const optionText = await option.textContent()
        if (optionText !== initialBoardName) {
          await option.click()
          break
        }
      }

      // Verify the board selector now shows the new board
      await expect(boardSelector).not.toHaveText(initialBoardName || '')
    }
  })

  test('board selector defaults to filtered board when filter is active', async () => {
    // Navigate with a board filter (using 'features' board which exists in database)
    await globalPage.goto('/?board=features')

    // Wait for posts to load first (indicates page is ready)
    const postCards = globalPage.locator('h3 a[href*="/posts/"]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })

    // Open the form
    await globalPage.getByPlaceholder("What's on your mind?").click()
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 10000 })

    // Viewing a board locks posting to that board — no switcher.
    const postingTo = globalPage.getByLabel(/Posting to Feature Requests/i)
    await expect(postingTo).toBeVisible({ timeout: 10000 })
    await expect(postingTo.getByRole('combobox')).toHaveCount(0)
  })

  test('can submit post to a different board than default', async () => {
    // Sort by new to see fresh posts
    await globalPage.getByRole('button', { name: /^New$/i }).click()
    await waitForNetworkIdle(globalPage)

    const uniqueTitle = `Different Board Post ${Date.now()}`

    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Change board selection
    const boardSelector = globalPage.locator('[role="combobox"]')
    await boardSelector.click()

    const selectContent = globalPage.locator('[role="listbox"]')
    await expect(selectContent).toBeVisible({ timeout: 5000 })

    // Select Products board (if available) as an alternative to default
    const productsOption = globalPage.locator('[role="option"]', { hasText: /products/i })
    if ((await productsOption.count()) > 0) {
      await productsOption.click()
    } else {
      // Just click any available option
      await globalPage.locator('[role="option"]').first().click()
    }

    // Fill in the form
    await globalPage.getByPlaceholder("What's on your mind?").fill(uniqueTitle)

    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('This post was submitted to a different board')

    // Submit
    await globalPage.getByRole('button', { name: /^post$/i }).click()
    // Editor should collapse after successful submission
    await expect(editor).not.toBeVisible({
      timeout: 10000,
    })

    // Post should appear (may need to adjust filters or check "All" view)
    // Navigate to all boards to see the post
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)
    await globalPage.getByRole('button', { name: /^New$/i }).click()
    await waitForNetworkIdle(globalPage)

    await expect(globalPage.getByRole('heading', { name: uniqueTitle })).toBeVisible({
      timeout: 15000,
    })
  })

  test('board selection persists after typing content', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // Change board selection
    const boardSelector = globalPage.locator('[role="combobox"]')
    await boardSelector.click()

    const selectContent = globalPage.locator('[role="listbox"]')
    await expect(selectContent).toBeVisible({ timeout: 5000 })

    // Select any option and note the board name
    const firstOption = globalPage.locator('[role="option"]').first()
    const selectedBoardName = await firstOption.textContent()
    await firstOption.click()

    // Type content
    await globalPage.getByPlaceholder("What's on your mind?").fill('Test title')
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('Test content')

    // Board selection should still be the same
    await expect(boardSelector).toHaveText(selectedBoardName || '')
  })

  test('board selection resets when dialog is closed and reopened', async () => {
    // Open the form
    await globalPage.getByPlaceholder("What's on your mind?").click()
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Get initial board name
    const boardSelector = globalPage.locator('[role="combobox"]')
    const initialBoardName = await boardSelector.textContent()

    // Change board selection
    await boardSelector.click()
    const selectContent = globalPage.locator('[role="listbox"]')
    await expect(selectContent).toBeVisible({ timeout: 5000 })

    const options = globalPage.locator('[role="option"]')
    const optionCount = await options.count()

    if (optionCount > 1) {
      // Select a different board
      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i)
        const optionText = await option.textContent()
        if (optionText !== initialBoardName) {
          await option.click()
          break
        }
      }
    }

    // Close form with Escape (editor should collapse)
    await globalPage.keyboard.press('Escape')
    await expect(editor).not.toBeVisible({
      timeout: 5000,
    })

    // Reopen form
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Board should be reset to initial/default
    await expect(boardSelector).toHaveText(initialBoardName || '')
  })

  test('shows "Posting to" label before board selector', async () => {
    // Open the dialog
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    // "Posting to" label should be visible
    await expect(globalPage.getByText('Posting to')).toBeVisible()
  })

  test('switching board filter updates default board in dialog', async () => {
    const editor = globalPage.locator('.tiptap')

    // Start with no filter - open form and note default board
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Close form
    await globalPage.keyboard.press('Escape')
    await expect(editor).not.toBeVisible({
      timeout: 5000,
    })

    // Click on Bug Reports board filter in sidebar (exists in seed data)
    const bugsFilter = globalPage.getByRole('button', { name: /Bug Reports/i })
    if ((await bugsFilter.count()) > 0) {
      await bugsFilter.click()
      await waitForNetworkIdle(globalPage)

      // Open form again
      await globalPage.getByPlaceholder("What's on your mind?").click()
      await expect(editor).toBeVisible({ timeout: 5000 })

      const postingTo = globalPage.getByLabel(/Posting to Bug Reports/i)
      await expect(postingTo).toBeVisible()
      await expect(postingTo.getByRole('combobox')).toHaveCount(0)
    }
  })

  test('switching between multiple board filters updates form default each time', async () => {
    const editor = globalPage.locator('.tiptap')

    // Click Feature Requests filter (board that exists in database)
    const featuresFilter = globalPage.getByRole('button', { name: /Feature Requests/i })
    if ((await featuresFilter.count()) > 0) {
      await featuresFilter.click()
      await waitForNetworkIdle(globalPage)

      // Open form - should post to Feature Requests with no switcher
      await globalPage.getByPlaceholder("What's on your mind?").click()
      await expect(editor).toBeVisible({ timeout: 5000 })
      const featuresPosting = globalPage.getByLabel(/Posting to Feature Requests/i)
      await expect(featuresPosting).toBeVisible()
      await expect(featuresPosting.getByRole('combobox')).toHaveCount(0)

      // Close form
      await globalPage.keyboard.press('Escape')
      await expect(editor).not.toBeVisible({
        timeout: 5000,
      })
    }

    // Click Bug Reports filter (another board that exists in seed data)
    const bugsFilter = globalPage.getByRole('button', { name: /Bug Reports/i })
    if ((await bugsFilter.count()) > 0) {
      await bugsFilter.click()
      await waitForNetworkIdle(globalPage)

      // Open form - should post to Bug Reports with no switcher
      await globalPage.getByPlaceholder("What's on your mind?").click()
      await expect(editor).toBeVisible({ timeout: 5000 })
      const bugsPosting = globalPage.getByLabel(/Posting to Bug Reports/i)
      await expect(bugsPosting).toBeVisible()
      await expect(bugsPosting.getByRole('combobox')).toHaveCount(0)

      // Close form
      await globalPage.keyboard.press('Escape')
      await expect(editor).not.toBeVisible({
        timeout: 5000,
      })
    }

    // Click "All" or go back to home to clear filter
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)

    // Open form - should default to first board (not filtered)
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Home keeps the board switcher
    const boardSelector = globalPage.locator('[role="combobox"]')
    await expect(boardSelector).toBeVisible()
    await expect(boardSelector).not.toHaveText('Select board')
  })

  test('clicking a board in the sidebar then opening dialog posts to that board', async () => {
    // Board rows live in the filter panel's "Boards" section. The panel also has
    // a "Show" section for signed-in viewers, so scope to the group rather than
    // taking `aside button` (which picked "My posts" before).
    const boardRows = globalPage.getByRole('group', { name: 'Boards' }).getByRole('button')
    // Skip "All boards" (row 0) so the pick differs from the default.
    const boardRow = boardRows.nth(1)

    // Extract just the board name (remove the count badge, e.g. "Bug Reports 110")
    const expectedBoardName = (await boardRow.textContent())?.split(/\d/)[0].trim() ?? ''
    expect(expectedBoardName.length).toBeGreaterThan(0)

    await boardRow.click()
    await expect(globalPage).toHaveURL(/[?&]board=/, { timeout: 5000 })
    await waitForNetworkIdle(globalPage)

    // Open the composer
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.locator('.tiptap')).toBeVisible({ timeout: 10000 })

    // A board-filtered feed locks the composer to that board: the header states
    // it and there is no board switcher. (The old test expected a combobox that
    // only renders on the all-boards feed.)
    const postingTo = globalPage.getByLabel(new RegExp(`Posting to ${expectedBoardName}`, 'i'))
    await expect(postingTo).toBeVisible({ timeout: 10000 })
    await expect(postingTo.getByRole('combobox')).toHaveCount(0)
  })
})

// Phase 2: Rich Text Editor Tests
test.describe('Rich Text Editor', () => {
  test.beforeEach(async () => {
    // Navigate to home for each test
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)

    // Open the dialog for all tests
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })
  })

  test('can type plain text in editor', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('This is plain text content')

    await expect(editor).toContainText('This is plain text content')
  })

  test('can format text as bold using toolbar button', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('bold text')

    // Triple-click to select text (Meta+a doesn't work in TipTap context)
    await editor.click({ clickCount: 3 })

    // Click bold button
    const boldButton = globalPage.locator('button:has(svg.lucide-bold)')
    await boldButton.click()

    // Verify text is bold
    await expect(editor.locator('strong')).toContainText('bold text')
  })

  test('can format text as italic using toolbar button', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('italic text')

    // Triple-click to select text
    await editor.click({ clickCount: 3 })

    // Click italic button
    const italicButton = globalPage.locator('button:has(svg.lucide-italic)')
    await italicButton.click()

    // Verify text is italic
    await expect(editor.locator('em')).toContainText('italic text')
  })

  test('can use keyboard shortcut for bold (Cmd/Ctrl+B)', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('bold text')

    // Select all text with keyboard, then apply bold
    await globalPage.keyboard.press('Control+a')
    await globalPage.keyboard.press('Control+b')

    // Verify text is bold
    await expect(editor.locator('strong')).toContainText('bold text')
  })

  test('can use keyboard shortcut for italic (Cmd/Ctrl+I)', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('italic text')

    // Select all text with keyboard, then apply italic
    await globalPage.keyboard.press('Control+a')
    await globalPage.keyboard.press('Control+i')

    // Verify text is italic
    await expect(editor.locator('em')).toContainText('italic text')
  })

  test('can create bullet list', async () => {
    const editor = globalPage.locator('.tiptap')

    // Click inside editor and type content first
    await editor.click()
    await globalPage.keyboard.type('First item')
    await globalPage.keyboard.press('Enter')
    await globalPage.keyboard.type('Second item')

    // Select all text to convert to a list
    await globalPage.keyboard.press('ControlOrMeta+a')

    // Click bullet list button to convert text to list. The toolbar button is
    // labelled (the bullet icon is a heroicon now, so no `svg.lucide-list`).
    const bulletListButton = globalPage.getByRole('button', { name: /^bullet list$/i })
    await bulletListButton.click()

    // Verify list structure
    await expect(editor.locator('ul')).toBeVisible()
    await expect(editor.locator('li')).toHaveCount(2)
  })

  test('can create numbered list', async () => {
    const editor = globalPage.locator('.tiptap')

    // Click inside editor and type content first
    await editor.click()
    await globalPage.keyboard.type('First item')
    await globalPage.keyboard.press('Enter')
    await globalPage.keyboard.type('Second item')

    // Select all text to convert to a list
    await globalPage.keyboard.press('ControlOrMeta+a')

    // Click numbered list button to convert text to list (labelled toolbar button)
    const numberedListButton = globalPage.getByRole('button', { name: /^ordered list$/i })
    await numberedListButton.click()

    // Verify list structure
    await expect(editor.locator('ol')).toBeVisible()
    await expect(editor.locator('li')).toHaveCount(2)
  })

  test('can add a link to text', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('click here')

    // Triple-click to select text
    await editor.click({ clickCount: 3 })

    // Two link controls exist while text is selected: the composer toolbar's
    // (window.prompt) and the selection bubble's URL popover. Handle whichever
    // this build shows — the old test only knew the prompt and a lucide icon.
    globalPage.once('dialog', (dialog) => dialog.accept('https://example.com'))
    await globalPage
      .getByRole('button', { name: /^insert link$/i })
      .last()
      .click()
    const urlInput = globalPage.getByPlaceholder('https://example.com')
    if (await urlInput.isVisible().catch(() => false)) {
      await urlInput.fill('https://example.com')
      await urlInput.press('Enter')
    }

    // Verify link was created
    const link = editor.locator('a')
    await expect(link).toHaveAttribute('href', 'https://example.com')
  })

  test('bold button shows active state when text is bold', async () => {
    const editor = globalPage.locator('.tiptap')
    await editor.click()
    await globalPage.keyboard.type('bold text')

    // Triple-click to select and make bold using toolbar button
    await editor.click({ clickCount: 3 })
    const boldButton = globalPage.locator('button:has(svg.lucide-bold)')
    await boldButton.click()

    // Click back in editor to position cursor within bold text
    await editor.click()

    // Bold button should have active state (bg-muted class)
    await expect(boldButton).toHaveClass(/bg-muted/)
  })
})

// Phase 3: Submission States and Integration Tests
test.describe('Submission States and Integration', () => {
  test.beforeEach(async () => {
    // Navigate to home for each test
    await globalPage.goto('/')
    await waitForNetworkIdle(globalPage)
  })

  test('submit button shows the "Post" label', async () => {
    await globalPage.getByPlaceholder("What's on your mind?").click()
    await expect(globalPage.getByPlaceholder("What's on your mind?")).toBeVisible({ timeout: 5000 })

    const submitButton = globalPage.getByRole('button', { name: /^post$/i })
    await expect(submitButton).toHaveText('Post')
  })

  test('can submit with Cmd+Enter keyboard shortcut', async () => {
    // Switch to New sort
    await globalPage.getByRole('button', { name: /^New$/i }).click()
    await waitForNetworkIdle(globalPage)

    const uniqueTitle = `Keyboard Submit Test ${Date.now()}`

    await globalPage.getByPlaceholder("What's on your mind?").click()
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await titleInput.fill(uniqueTitle)

    await editor.click()
    await globalPage.keyboard.type('Submitted with keyboard shortcut')

    // Submit with Cmd+Enter
    await globalPage.keyboard.press('Meta+Enter')

    // Dialog should close
    await expect(editor).not.toBeVisible({ timeout: 10000 })

    // Post should appear
    await expect(globalPage.getByRole('heading', { name: uniqueTitle })).toBeVisible({
      timeout: 10000,
    })
  })

  test('Submit form is visible on filtered board', async () => {
    // Navigate with board filter (using 'features' board which exists in database)
    await globalPage.goto('/?board=features')
    await waitForNetworkIdle(globalPage)

    // Submit form input should be visible
    const createPostInput = globalPage.getByPlaceholder("What's on your mind?")
    await expect(createPostInput).toBeVisible({ timeout: 10000 })
  })

  test('post submits to the current board context', async () => {
    // Open the board-filtered feed directly: the panel folds boards past the
    // first six behind "N more", so a workspace with extra boards (the access
    // fixtures add six) cannot be relied on to show "Feature Requests" as a row.
    await globalPage.goto('/?board=features')
    await waitForNetworkIdle(globalPage)

    // Click New sort to see newest posts first
    const newSortButton = globalPage.getByRole('button', { name: /^New$/i })
    await newSortButton.click()
    await waitForNetworkIdle(globalPage)

    const uniqueTitle = `Feature Requests Board Post ${Date.now()}`

    await globalPage.getByPlaceholder("What's on your mind?").click()
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await titleInput.fill(uniqueTitle)

    await editor.click()
    await globalPage.keyboard.type('This post should appear in the features board')

    await globalPage.getByRole('button', { name: /^post$/i }).click()
    await expect(editor).not.toBeVisible({ timeout: 10000 })

    // Reload page to ensure fresh server data is displayed
    // (Client state doesn't auto-update with router.refresh when filters are already set)
    await globalPage.reload()
    await waitForNetworkIdle(globalPage)

    // Post should appear in the filtered results (still on features board)
    await expect(globalPage.getByRole('heading', { name: uniqueTitle })).toBeVisible({
      timeout: 15000,
    })

    // URL should still have board filter
    await expect(globalPage).toHaveURL(/board=features/)
  })

  test('submitted post shows author name', async () => {
    // Sort by new to see fresh posts
    await globalPage.getByRole('button', { name: /^New$/i }).click()
    await waitForNetworkIdle(globalPage)

    const uniqueTitle = `Author Test Post ${Date.now()}`

    await globalPage.getByPlaceholder("What's on your mind?").click()
    const titleInput = globalPage.getByPlaceholder("What's on your mind?")
    const editor = globalPage.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await titleInput.fill(uniqueTitle)

    await editor.click()
    await globalPage.keyboard.type('Testing author attribution')

    await globalPage.getByRole('button', { name: /^post$/i }).click()
    await expect(editor).not.toBeVisible({ timeout: 10000 })

    // Find the post and verify author is shown
    const postCard = globalPage.locator('[data-post-id]').filter({ hasText: uniqueTitle })
    await expect(postCard).toBeVisible({ timeout: 10000 })

    // Should show "Demo User" as author (from demo@example.com)
    await expect(postCard).toContainText(/Demo|demo/i)
  })
})
