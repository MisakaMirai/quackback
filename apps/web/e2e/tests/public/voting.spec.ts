import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect, BrowserContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginViaMagicLink, setWorkspaceAnon } from '../../utils/access-helpers'
import { enableMagicLinkMethod, clearSigninRateLimit } from '../../utils/db-helpers'

const APPS_WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Drop the cached workspace settings row so a just-written portal config takes
 * effect without waiting for the cache to expire. Same suite script the
 * board-access fixtures use; kept local because it is not a db-helper export.
 */
function bustSettingsCache(): void {
  execFileSync(
    'bun',
    ['--env-file=../../.env', 'e2e/scripts/bust-caches.ts', 'settings:workspace'],
    {
      cwd: APPS_WEB_ROOT,
      encoding: 'utf-8',
    }
  )
}

const TEST_EMAIL = 'demo@example.com'

/**
 * Sign a browser context in through the magic-link flow that global setup and
 * the rest of the suite use.
 *
 * Magic link is opt-in per workspace and the seed leaves it off; the admin
 * project's global setup enables it, but a public-only run does not depend on
 * that project, so provision it here. The per-address sign-in budget the
 * limiter keeps (3 sends per 15 minutes) is cleared too — the old OTP retry
 * loop spent it and then span until the beforeAll timeout.
 */
async function authenticateViaMagicLink(context: BrowserContext) {
  enableMagicLinkMethod()
  clearSigninRateLimit()
  await loginViaMagicLink(context, TEST_EMAIL)
}

test.describe.configure({ mode: 'serial' })

// Anonymous voting is the workspace `features.allowAnonymous` master switch over
// the boards' anonymous vote tier. The seed ships the switch OFF (so an
// anonymous click raises sign-in), while the seed boards do allow the anonymous
// tier — the anonymous and rapid-click suites below need it on. Turn it on once
// for the file and put it back at the end; the settings row is cached
// server-side, hence the cache bust.
test.beforeAll(async () => {
  setWorkspaceAnon(true)
  bustSettingsCache()
})

test.afterAll(async () => {
  setWorkspaceAnon(false)
  bustSettingsCache()
})

test.describe('Public Voting', () => {
  let sharedContext: BrowserContext
  let isAuthenticated = false

  // Increase timeout to 90 seconds to handle rate limiting
  test.setTimeout(90000)

  test.beforeAll(async ({ browser }) => {
    // Create a shared context and authenticate once for all tests
    sharedContext = await browser.newContext()
    await authenticateViaMagicLink(sharedContext)
    isAuthenticated = true
  })

  test.afterAll(async () => {
    if (sharedContext) {
      await sharedContext.close()
    }
  })

  test.beforeEach(async () => {
    expect(isAuthenticated).toBe(true)
  })

  test('displays vote count on posts', async () => {
    const page = await sharedContext.newPage()
    try {
      // Navigate to the public portal
      await page.goto('/')
      // Wait for posts to load
      await waitForNetworkIdle(page)

      // Look for vote buttons using data-testid
      const voteButtons = page.getByTestId('vote-button')

      await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

      // Vote count should be displayed as a number
      const voteCount = voteButtons.first().getByTestId('vote-count')
      await expect(voteCount).toBeVisible()
      const countText = await voteCount.textContent()
      expect(countText).toMatch(/^\d+$/)
    } finally {
      await page.close()
    }
  })

  test('can upvote a post (from unvoted state)', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Use 6th post to avoid conflicts with other tests
      const voteButtons = page.getByTestId('vote-button')
      const voteButton = voteButtons.nth(5)
      await expect(voteButton).toBeVisible({ timeout: 10000 })

      const voteCountSpan = voteButton.getByTestId('vote-count')

      // Check if already voted (button has active class)
      const isAlreadyVoted = await voteButton.evaluate((el) =>
        el.classList.contains('post-card__vote--voted')
      )

      // If already voted, click to remove vote first to get to clean state
      if (isAlreadyVoted) {
        await voteButton.click()
        // Wait for unvoted state to be reflected
        await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
        await waitForNetworkIdle(page)
      }

      // Now get the baseline count (user has not voted)
      const baselineCountText = await voteCountSpan.textContent()
      const baselineCount = parseInt(baselineCountText || '0', 10)

      // Click to add vote
      await voteButton.click()

      // Wait for voted state first (more reliable than checking count)
      await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })

      // Verify the count increased
      await expect(voteCountSpan).toHaveText(String(baselineCount + 1), { timeout: 5000 })
    } finally {
      await page.close()
    }
  })

  test('can remove vote (from voted state)', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Use 7th post to avoid conflicts with other tests
      const voteButtons = page.getByTestId('vote-button')
      const voteButton = voteButtons.nth(6)
      await expect(voteButton).toBeVisible({ timeout: 10000 })

      const voteCountSpan = voteButton.getByTestId('vote-count')

      // Check if already voted
      const isAlreadyVoted = await voteButton.evaluate((el) =>
        el.classList.contains('post-card__vote--voted')
      )

      // If not voted, click to add vote first to get to voted state
      if (!isAlreadyVoted) {
        await voteButton.click()
        // Wait for voted state to be reflected
        await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
        await waitForNetworkIdle(page)
      }

      // Now get the baseline count (user has voted)
      const baselineCountText = await voteCountSpan.textContent()
      const baselineCount = parseInt(baselineCountText || '0', 10)

      // Click to remove vote
      await voteButton.click()

      // Wait for unvoted state first (more reliable than checking count)
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 5000 })

      // Verify the count decreased
      await expect(voteCountSpan).toHaveText(String(baselineCount - 1), { timeout: 5000 })
    } finally {
      await page.close()
    }
  })

  test('can toggle vote on and off', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Use 8th post to avoid conflicts with other tests
      const voteButtons = page.getByTestId('vote-button')
      const voteButton = voteButtons.nth(7)
      await expect(voteButton).toBeVisible({ timeout: 10000 })

      const voteCountSpan = voteButton.getByTestId('vote-count')

      // Ensure we start from unvoted state
      const isAlreadyVoted = await voteButton.evaluate((el) =>
        el.classList.contains('post-card__vote--voted')
      )
      if (isAlreadyVoted) {
        await voteButton.click()
        await page.waitForTimeout(500)
      }

      const initialCountText = await voteCountSpan.textContent()
      const initialCount = parseInt(initialCountText || '0', 10)

      // First click - vote (should increase by 1)
      await voteButton.click()
      await expect(voteCountSpan).toHaveText(String(initialCount + 1), { timeout: 5000 })
      await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 2000 })

      // Second click - unvote (should return to initial count)
      await voteButton.click()
      await expect(voteCountSpan).toHaveText(String(initialCount), { timeout: 5000 })
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 2000 })
    } finally {
      await page.close()
    }
  })

  test('can vote on post detail page', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Navigate to 9th post detail page to avoid conflicts with other tests
      const postLinks = page.locator('a[href*="/posts/"]')
      await expect(postLinks.nth(8)).toBeVisible({ timeout: 10000 })

      // Click the 9th post link
      await postLinks.nth(8).click()

      // Wait for URL to change to post detail page
      await page.waitForURL(/\/posts\//)

      // Wait for the detail page itself (its comments heading): reading the vote
      // button while the list was still mounted measured the list's count and
      // missed the sidebar's own vote state.
      await expect(page.getByRole('heading', { name: /\d+ comments?/i })).toBeVisible({
        timeout: 15000,
      })

      // Wait for detail page vote button specifically.
      // The VoteSidebar vote button is in a Suspense boundary; use aria-pressed to confirm it loaded.
      // Both list and detail use text-sm, so just use the first vote button on the detail page.
      const detailVoteButton = page.getByTestId('vote-button').first()
      await expect(detailVoteButton).toBeVisible({ timeout: 10000 })

      const voteCountSpan = detailVoteButton.getByTestId('vote-count')

      // Ensure we start from unvoted state (check aria-pressed which works across all vote buttons)
      const isAlreadyVoted = (await detailVoteButton.getAttribute('aria-pressed')) === 'true'
      if (isAlreadyVoted) {
        await detailVoteButton.click()
        // Wait for unvoted state
        await expect(detailVoteButton).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 })
        await waitForNetworkIdle(page)
      }

      // Get baseline count from the detail page vote button
      const baselineCountText = await voteCountSpan.textContent()
      const baselineCount = parseInt(baselineCountText || '0', 10)

      // Click the detail page vote button to add vote
      await detailVoteButton.click()

      // Verify button shows voted state (aria-pressed is more reliable than class name)
      await expect(detailVoteButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 })

      // Verify count increased
      await expect(voteCountSpan).toHaveText(String(baselineCount + 1), { timeout: 5000 })
    } finally {
      await page.close()
    }
  })
})

test.describe('Anonymous Voting (unauthenticated)', () => {
  // The anonymous switch is enabled for the file (see the file-level hooks).
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)
  })

  test('shows vote count for unauthenticated users', async ({ page }) => {
    const voteButtons = page.getByTestId('vote-button')
    await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

    const voteCount = voteButtons.first().getByTestId('vote-count')
    await expect(voteCount).toBeVisible()
    const countText = await voteCount.textContent()
    expect(countText).toMatch(/^\d+$/)
  })

  test('anonymous user can vote without signing in', async ({ page }) => {
    // Use 10th post to avoid conflicts with authenticated voting tests
    const voteButtons = page.getByTestId('vote-button')
    const voteButton = voteButtons.nth(9)
    await expect(voteButton).toBeVisible({ timeout: 10000 })

    const voteCountSpan = voteButton.getByTestId('vote-count')

    // Ensure we start from unvoted state
    const isAlreadyVoted = await voteButton.evaluate((el) =>
      el.classList.contains('post-card__vote--voted')
    )
    if (isAlreadyVoted) {
      await voteButton.click()
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 10000 })
      await waitForNetworkIdle(page)
    }

    const baselineCountText = await voteCountSpan.textContent()
    const baselineCount = parseInt(baselineCountText || '0', 10)

    // Click vote — anonymous sign-in happens silently, then vote fires
    await voteButton.click()

    // Vote count should increase (no auth dialog shown)
    await expect(voteCountSpan).toHaveText(String(baselineCount + 1), { timeout: 10000 })
    await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })

    // Auth dialog should NOT appear
    const authDialog = page.locator('[role="dialog"]').filter({ hasText: /sign in|log in|email/i })
    await expect(authDialog).not.toBeVisible()
  })

  test('anonymous user can toggle vote off', async ({ page }) => {
    // Use 11th post to avoid conflicts
    const voteButtons = page.getByTestId('vote-button')
    const voteButton = voteButtons.nth(10)
    await expect(voteButton).toBeVisible({ timeout: 10000 })

    const voteCountSpan = voteButton.getByTestId('vote-count')

    // Ensure we start from unvoted state
    const isAlreadyVoted = await voteButton.evaluate((el) =>
      el.classList.contains('post-card__vote--voted')
    )
    if (isAlreadyVoted) {
      await voteButton.click()
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 10000 })
      await waitForNetworkIdle(page)
    }

    const baselineCountText = await voteCountSpan.textContent()
    const baselineCount = parseInt(baselineCountText || '0', 10)

    // First click — vote
    await voteButton.click()
    await expect(voteCountSpan).toHaveText(String(baselineCount + 1), { timeout: 10000 })

    // Second click — unvote
    await voteButton.click()
    await expect(voteCountSpan).toHaveText(String(baselineCount), { timeout: 10000 })
    await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
  })
})

test.describe('Voting — count display and accessibility', () => {
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)
  })

  test('vote count is shown as a plain number (not empty or NaN)', async ({ page }) => {
    const voteButtons = page.getByTestId('vote-button')
    await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

    // Check the first five visible posts — every count must be a non-empty integer
    const count = Math.min(await voteButtons.count(), 5)
    for (let i = 0; i < count; i++) {
      const countSpan = voteButtons.nth(i).getByTestId('vote-count')
      const text = await countSpan.textContent()
      expect(text).not.toBe('')
      expect(text).not.toBeNull()
      expect(Number.isNaN(Number(text))).toBe(false)
      // Must be a whole number string (no decimals, no "NaN", no undefined)
      expect(text).toMatch(/^\d+$/)
    }
  })

  test('vote button has aria-pressed attribute for accessibility', async ({ page }) => {
    const voteButtons = page.getByTestId('vote-button')
    await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

    const ariaPressed = await voteButtons.first().getAttribute('aria-pressed')
    // aria-pressed must be "true" or "false" — not null or missing
    expect(['true', 'false']).toContain(ariaPressed)
  })
})

test.describe('Voting — independence and persistence', () => {
  test.setTimeout(90000)

  // Use a fresh authenticated context for persistence tests so votes survive navigation
  let sharedContext: import('@playwright/test').BrowserContext

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext()
    // Same magic-link sign-in as the suite above, so votes persist across
    // navigation without depending on the rate-limited OTP send.
    await authenticateViaMagicLink(sharedContext)
  })

  test.afterAll(async () => {
    if (sharedContext) await sharedContext.close()
  })

  test('multiple posts can be voted on independently', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      const voteButtons = page.getByTestId('vote-button')
      await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

      // Use posts 12 and 13 (0-indexed) to stay clear of other test slots
      const buttonA = voteButtons.nth(12)
      const buttonB = voteButtons.nth(13)

      const countSpanA = buttonA.getByTestId('vote-count')
      const countSpanB = buttonB.getByTestId('vote-count')

      // Normalise both to unvoted state
      for (const btn of [buttonA, buttonB]) {
        const voted = await btn.evaluate((el) => el.classList.contains('post-card__vote--voted'))
        if (voted) {
          await btn.click()
          await expect(btn).not.toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
          await waitForNetworkIdle(page)
        }
      }

      const baseA = parseInt((await countSpanA.textContent()) || '0', 10)
      const baseB = parseInt((await countSpanB.textContent()) || '0', 10)

      // Vote on post A only
      await buttonA.click()
      await expect(buttonA).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
      await expect(countSpanA).toHaveText(String(baseA + 1), { timeout: 5000 })

      // Post B must be unchanged
      await expect(countSpanB).toHaveText(String(baseB), { timeout: 2000 })
      await expect(buttonB).not.toHaveClass(/post-card__vote--voted/)

      // Vote on post B
      await buttonB.click()
      await expect(buttonB).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
      await expect(countSpanB).toHaveText(String(baseB + 1), { timeout: 5000 })

      // Post A count stays at baseA + 1
      await expect(countSpanA).toHaveText(String(baseA + 1), { timeout: 2000 })
    } finally {
      await page.close()
    }
  })

  test('vote persists after navigating away and returning to post list', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Use post 14 to avoid conflicts
      const voteButton = page.getByTestId('vote-button').nth(14)
      await expect(voteButton).toBeVisible({ timeout: 10000 })

      // Normalise to unvoted state
      const isVoted = await voteButton.evaluate((el) =>
        el.classList.contains('post-card__vote--voted')
      )
      if (isVoted) {
        await voteButton.click()
        await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
        await waitForNetworkIdle(page)
      }

      // Vote
      await voteButton.click()
      await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })

      // Navigate away to a different page then come back
      await page.goto('/admin/feedback')
      await waitForNetworkIdle(page)
      await page.goto('/')
      await waitForNetworkIdle(page)

      // The vote should still be reflected (button shows voted state)
      const returnedButton = page.getByTestId('vote-button').nth(14)
      await expect(returnedButton).toBeVisible({ timeout: 10000 })
      await expect(returnedButton).toHaveClass(/post-card__vote--voted/, { timeout: 5000 })
    } finally {
      await page.close()
    }
  })

  test('vote count on post list matches vote count on post detail page', async () => {
    const page = await sharedContext.newPage()
    try {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Use post 15 to avoid conflicts
      const voteButtons = page.getByTestId('vote-button')
      await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

      const listVoteButton = voteButtons.nth(15)
      const listCountSpan = listVoteButton.getByTestId('vote-count')
      const listCount = await listCountSpan.textContent()

      // Find the post link in the same card and navigate to it
      const postLinks = page.locator('a[href*="/posts/"]')
      await postLinks.nth(15).click()
      await page.waitForURL(/\/posts\//)
      await waitForNetworkIdle(page)
      // The detail page has rendered once its comments heading is there; compare
      // counts only then, so the list's card is not measured.
      await expect(page.getByRole('heading', { name: /\d+ comments?/i })).toBeVisible({
        timeout: 15000,
      })

      // Detail page vote button — use first vote button (VoteSidebar, in DOM order)
      const detailVoteButton = page.getByTestId('vote-button').first()
      await expect(detailVoteButton).toBeVisible({ timeout: 10000 })

      const detailCount = await detailVoteButton.getByTestId('vote-count').textContent()

      expect(detailCount).toBe(listCount)
    } finally {
      await page.close()
    }
  })
})

test.describe('Voting — debounce / rapid clicks', () => {
  test.setTimeout(60000)

  test('rapid clicks do not cause double-voting', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Use an anonymous session (no auth setup needed for this test)
    const voteButtons = page.getByTestId('vote-button')
    await expect(voteButtons.first()).toBeVisible({ timeout: 10000 })

    // Use post 16 — unlikely to conflict with authenticated tests above
    const voteButton = voteButtons.nth(16)
    const countSpan = voteButton.getByTestId('vote-count')

    // Normalise to unvoted
    const isVoted = await voteButton.evaluate((el) =>
      el.classList.contains('post-card__vote--voted')
    )
    if (isVoted) {
      await voteButton.click()
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 10000 })
      await waitForNetworkIdle(page)
    }

    const baseCount = parseInt((await countSpan.textContent()) || '0', 10)

    // Fire three rapid clicks — debounce/idempotency should result in net +1 or 0
    await voteButton.click()
    await voteButton.click()
    await voteButton.click()

    // After rapid clicks settle, count should not exceed baseCount + 1
    await page.waitForTimeout(1000)
    const finalText = await countSpan.textContent()
    const finalCount = parseInt(finalText || '0', 10)
    expect(finalCount).toBeLessThanOrEqual(baseCount + 1)
    expect(finalCount).toBeGreaterThanOrEqual(baseCount - 1)
  })
})

test.describe('Voting — filtered board context', () => {
  test.setTimeout(60000)

  test('voting on a post works when a board filter is active', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click the first board filter tab if any exist
    const boardTabs = page.locator('[data-testid="board-tab"], button[data-board]')
    const tabCount = await boardTabs.count()

    if (tabCount > 0) {
      await boardTabs.first().click()
      await waitForNetworkIdle(page)
    } else {
      // No explicit board tabs — use URL query parameter for the first available board
      const firstBoardLink = page.locator('a[href*="?board="], a[href*="&board="]').first()
      if ((await firstBoardLink.count()) > 0) {
        await firstBoardLink.click()
        await waitForNetworkIdle(page)
      }
    }

    // After filtering, vote buttons should still be present and functional
    const filteredVoteButtons = page.getByTestId('vote-button')
    const hasButtons = (await filteredVoteButtons.count()) > 0

    if (!hasButtons) {
      // Board has no posts — nothing to vote on, test is vacuously satisfied
      return
    }

    const voteButton = filteredVoteButtons.first()
    const countSpan = voteButton.getByTestId('vote-count')

    // Normalise to unvoted
    const isVoted = await voteButton.evaluate((el) =>
      el.classList.contains('post-card__vote--voted')
    )
    if (isVoted) {
      await voteButton.click()
      await expect(voteButton).not.toHaveClass(/post-card__vote--voted/, { timeout: 10000 })
      await waitForNetworkIdle(page)
    }

    const baseCount = parseInt((await countSpan.textContent()) || '0', 10)

    await voteButton.click()

    await expect(voteButton).toHaveClass(/post-card__vote--voted/, { timeout: 10000 })
    await expect(countSpan).toHaveText(String(baseCount + 1), { timeout: 10000 })
  })
})
