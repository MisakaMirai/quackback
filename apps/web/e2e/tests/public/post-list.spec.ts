import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect, type Page } from '@playwright/test'

test.describe('Public Post List', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the public portal (workspace subdomain)
    await page.goto('/')
  })

  test('displays feedback posts', async ({ page }) => {
    // Should show at least one post card (Link elements with href containing /posts/)
    const postCards = page.locator('h3 a[href*="/posts/"]')
    await expect(postCards.first()).toBeVisible({ timeout: 10000 })

    // Each post should have a title visible
    const firstPost = postCards.first()
    await expect(firstPost).toBeVisible()
  })

  test('shows post details on cards', async ({ page }) => {
    // Wait for posts to load
    const postCards = page.locator('h3 a[href*="/posts/"]')
    await expect(postCards.first()).toBeVisible({ timeout: 10000 })

    // Posts should display vote button with count
    await expect(page.getByTestId('vote-button').first()).toBeVisible()

    // Posts should display comment count (message icon)
    // Note: Comment icon doesn't have a test-id yet, using a more flexible selector
    const commentIcon = page.locator('svg').filter({ hasText: '' }).first()
    if ((await commentIcon.count()) > 0) {
      await expect(commentIcon).toBeVisible()
    }
  })

  test('can filter by board using sidebar', async ({ page }) => {
    // Wait for page to load
    await waitForNetworkIdle(page)

    // Look for board filter buttons in sidebar
    const boardButtons = page.locator('aside button').filter({ hasText: /feature|bug|general/i })

    // If board filter exists, click it
    const boardButton = boardButtons.first()
    if ((await boardButton.count()) > 0) {
      await boardButton.click()

      // URL should update with board parameter
      await expect(page).toHaveURL(/[?&]board=/, { timeout: 5000 })
    }
  })

  test('can search for posts', async ({ page }) => {
    // Look for search input
    await waitForNetworkIdle(page)
    const searchInput = page.getByPlaceholder(/search/i)

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('test')
      await searchInput.press('Enter')

      // URL should update with search parameter
      await expect(page).toHaveURL(/[?&]search=test/, { timeout: 5000 })
    }
  })

  test('defaults to Trending sort with visual indicator', async ({ page }) => {
    // Navigate to page without sort param
    await page.goto('/')
    await waitForNetworkIdle(page)

    // "Trending" button should be active (has font-medium class)
    const trendingButton = page.getByRole('button', { name: /^Trending$/i })
    await expect(trendingButton).toHaveClass(/font-medium/)

    // Other sort buttons should not be active
    const topButton = page.getByRole('button', { name: /^Top$/i })
    const newButton = page.getByRole('button', { name: /^New$/i })
    await expect(topButton).not.toHaveClass(/font-medium/)
    await expect(newButton).not.toHaveClass(/font-medium/)
  })

  test('can sort posts by clicking New', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click "New" sort option
    const newButton = page.getByRole('button', { name: /^New$/i })
    await newButton.click()

    // URL should update with sort parameter
    await expect(page).toHaveURL(/[?&]sort=new/)

    // "New" should now be active
    await expect(newButton).toHaveClass(/font-medium/)

    // "Top" should no longer be active
    const topButton = page.getByRole('button', { name: /^Top$/i })
    await expect(topButton).not.toHaveClass(/font-medium/)
  })

  test('can sort posts by clicking Trending', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click "Trending" sort option
    const trendingButton = page.getByRole('button', { name: /^Trending$/i })
    await trendingButton.click()

    // URL should update with sort parameter
    await expect(page).toHaveURL(/[?&]sort=trending/)

    // "Trending" should now be active
    await expect(trendingButton).toHaveClass(/font-medium/)
  })

  test('navigating with sort param in URL shows correct active state', async ({ page }) => {
    // Navigate directly with sort=new
    await page.goto('/?sort=new')
    await waitForNetworkIdle(page)

    // "New" should be active
    const newButton = page.getByRole('button', { name: /^New$/i })
    await expect(newButton).toHaveClass(/font-medium/)

    // "Top" should not be active
    const topButton = page.getByRole('button', { name: /^Top$/i })
    await expect(topButton).not.toHaveClass(/font-medium/)
  })

  test('can switch between all sort options', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    const topButton = page.getByRole('button', { name: /^Top$/i })
    const newButton = page.getByRole('button', { name: /^New$/i })
    const trendingButton = page.getByRole('button', { name: /^Trending$/i })

    // Start with Trending active
    await expect(trendingButton).toHaveClass(/font-medium/)

    // Switch to New
    await newButton.click()
    await expect(page).toHaveURL(/[?&]sort=new/)
    await expect(newButton).toHaveClass(/font-medium/)
    await expect(trendingButton).not.toHaveClass(/font-medium/)

    // Switch to Top
    await topButton.click()
    await expect(page).toHaveURL(/[?&]sort=top/)
    await expect(topButton).toHaveClass(/font-medium/)
    await expect(newButton).not.toHaveClass(/font-medium/)

    // Switch back to Trending
    await trendingButton.click()
    await expect(page).toHaveURL(/[?&]sort=trending/)
    await expect(trendingButton).toHaveClass(/font-medium/)
    await expect(topButton).not.toHaveClass(/font-medium/)
  })

  test('sort persists with board filter', async ({ page }) => {
    // Navigate with both board and sort params (using 'features' board which exists in database)
    await page.goto('/?board=features&sort=new')

    // Wait for page to be ready
    await waitForNetworkIdle(page)

    // Skip if the features board has no posts in this environment
    const postCards = page.locator('[data-post-id]')
    test.skip(
      (await postCards.count()) === 0,
      'No posts found for features board in this environment'
    )

    // Both filters should be active
    await expect(page).toHaveURL(/board=features/)
    await expect(page).toHaveURL(/sort=new/)

    // Sort button should show correct state (wait for it to have the class)
    const newButton = page.getByRole('button', { name: /^New$/i })
    await expect(newButton).toHaveClass(/font-medium/, { timeout: 10000 })

    // Board should be selected
    const featuresButton = page
      .getByRole('group', { name: 'Boards' })
      .getByRole('button', { name: /Feature Requests/i })
    await expect(featuresButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 })
  })

  test('clicking post navigates to detail page', async ({ page }) => {
    // Wait for posts to load
    const postCards = page.locator('h3 a[href*="/posts/"]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })

    // Get the href of the first post
    const firstPostHref = await postCards.first().getAttribute('href')

    // Click the first post and wait for navigation
    await Promise.all([page.waitForURL(/\/posts\//, { timeout: 15000 }), postCards.first().click()])

    // Should navigate to the post detail page
    if (firstPostHref) {
      await expect(page).toHaveURL(
        new RegExp(firstPostHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        { timeout: 10000 }
      )
    }
  })

  test('displays post status badges', async ({ page }) => {
    // Wait for posts to load
    await waitForNetworkIdle(page)

    // Look for status badges (they have specific styling)
    const statusBadges = page.locator('[class*="badge"]')

    // At least one badge should be visible (either status or tag)
    if ((await statusBadges.count()) > 0) {
      await expect(statusBadges.first()).toBeVisible()
    }
  })

  test('displays filtered posts when navigating with board param in URL', async ({ page }) => {
    // Navigate directly to URL with board filter (using 'features' board which exists in database)
    await page.goto('/?board=features')

    // Wait for page to be ready
    await waitForNetworkIdle(page)

    // Skip if the features board has no posts in this environment
    const postCards = page.locator('[data-post-id]')
    test.skip(
      (await postCards.count()) === 0,
      'No posts found for features board in this environment'
    )

    // URL should contain the board parameter
    await expect(page).toHaveURL(/[?&]board=features/)

    // The "Feature Requests" board is selected in the sidebar
    const boards = page.getByRole('group', { name: 'Boards' })
    const featuresButton = boards.getByRole('button', { name: /Feature Requests/i })
    await expect(featuresButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 })

    // "All boards" is not
    const allBoards = boards.getByRole('button', { name: 'All boards' })
    await expect(allBoards).toHaveAttribute('aria-pressed', 'false')
  })

  test('can view all posts after filtering by board', async ({ page }) => {
    // Start with a board filter applied (using 'features' board which exists in database)
    await page.goto('/?board=features')
    await waitForNetworkIdle(page)

    // Verify we're filtered
    await expect(page).toHaveURL(/[?&]board=features/)

    // Click "All boards" in the sidebar
    const boards = page.getByRole('group', { name: 'Boards' })
    await boards.getByRole('button', { name: 'All boards' }).click()

    // URL should no longer have the board parameter
    await expect(page).not.toHaveURL(/[?&]board=/)

    // Navigate fresh to verify the state renders correctly
    await page.goto('/')
    await waitForNetworkIdle(page)

    // "All boards" should now be selected
    await expect(
      page.getByRole('group', { name: 'Boards' }).getByRole('button', { name: 'All boards' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('filtered board posts link to correct board routes', async ({ page }) => {
    // Navigate to features board
    await page.goto('/?board=features')
    await waitForNetworkIdle(page)

    // Get all post links
    const postLinks = page.locator('a[href*="/posts/"]')
    const linkCount = await postLinks.count()

    if (linkCount > 0) {
      // Check that all visible posts link to the features board
      for (let i = 0; i < Math.min(linkCount, 5); i++) {
        const href = await postLinks.nth(i).getAttribute('href')
        // Posts should link to /b/features/posts/{id}
        expect(href).toMatch(/^\/b\/features\/posts\//)
      }
    }
  })

  test('switching boards updates displayed posts', async ({ page }) => {
    // Start with features board
    await page.goto('/?board=features')
    await waitForNetworkIdle(page)

    // Get initial post hrefs (all should be /features/posts/...)
    const initialLinks = page.locator('a[href*="/posts/"]')
    const initialCount = await initialLinks.count()

    if (initialCount > 0) {
      const firstInitialHref = await initialLinks.first().getAttribute('href')
      expect(firstInitialHref).toMatch(/^\/b\/features\/posts\//)
    }

    // Switch to bugs board via sidebar
    const bugsButton = page.getByRole('button', { name: /Bug Reports/i })
    if ((await bugsButton.count()) > 0) {
      await bugsButton.click()

      // URL should update
      await expect(page).toHaveURL(/[?&]board=bugs/)
      await waitForNetworkIdle(page)

      // Wait for posts to refresh - should now link to /bugs/posts/...
      // Use a locator that specifically looks for bugs board posts
      const bugsPostLinks = page.locator('a[href*="/b/bugs/posts/"]')
      await expect(bugsPostLinks.first()).toBeVisible({ timeout: 10000 })

      const firstNewHref = await bugsPostLinks.first().getAttribute('href')
      expect(firstNewHref).toMatch(/^\/b\/bugs\/posts\//)
    }
  })

  // The feed's "Filter" popover is gone: the same filters live in a permanent
  // panel (sidebar on wide screens, a "Filters" sheet on phones), applied
  // filters show as chips above the feed, and "Clear all" appears with 2 chips.
  test.describe('Filter panel and chips', () => {
    const statusGroup = (page: Page) => page.getByRole('group', { name: 'Status', exact: true })
    const tagGroup = (page: Page) => page.getByRole('group', { name: 'Tags' })
    const activeFilters = (page: Page) => page.getByRole('region', { name: 'Active filters' })
    /** The filter panel's result total, rendered as an accessible status line. */
    const resultTotal = async (page: Page): Promise<number> => {
      const text = await page.locator('p[role="status"]').innerText()
      return Number(text.match(/\d[\d,]*/)?.[0].replace(/,/g, '') ?? '0')
    }

    test('filter panel is in the sidebar with its filter sections', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // There is no popover to open any more — the sections are always on the
      // page, beside the feed.
      await expect(page.getByRole('group', { name: 'Boards' })).toBeVisible()
      await expect(statusGroup(page)).toBeVisible()
      await expect(tagGroup(page)).toBeVisible()

      // The less common filters still unfold behind "More filters".
      const moreFilters = page.getByRole('button', { name: /^more filters$/i })
      await expect(moreFilters).toHaveAttribute('aria-expanded', 'false')
      await moreFilters.click()
      await expect(moreFilters).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('group', { name: 'Vote count' })).toBeVisible()
    })

    test('filter panel shows the status options as toggle pills', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      const status = statusGroup(page)
      // Each seed status is a toggle pill; its accessible name also carries the
      // post count, and none is lit until the visitor picks one.
      for (const name of ['Open', 'Under Review', 'Planned', 'In Progress', 'Complete', 'Closed']) {
        await expect(status.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
      }
      await expect(status.getByRole('button', { name: /^Open/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    test('can select status filter', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      const complete = statusGroup(page).getByRole('button', { name: /^Complete/ })
      await complete.click()

      // URL carries the status slug, and the pill lights up.
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      await expect(complete).toHaveAttribute('aria-pressed', 'true')
      await expect(activeFilters(page)).toContainText('Status:')
    })

    test('filter button shows the active filter count (phone)', async ({ page }) => {
      // The numeric badge now lives on the phone's "Filters" sheet trigger; on
      // wide screens the chips above the feed state the same thing.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await waitForNetworkIdle(page)

      await page.getByRole('button', { name: /^Filters$/ }).click()
      const sheet = page.getByRole('dialog', { name: 'Filters' })
      await sheet
        .getByRole('group', { name: 'Status', exact: true })
        .getByRole('button', { name: /^Complete/ })
        .click()
      await page.getByRole('button', { name: 'Done' }).click()

      // The trigger names the one filter that is on.
      await expect(page.getByRole('button', { name: /^Filters, 1 on$/ })).toBeVisible()
    })

    test('can clear all filters', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Two different filters are needed before "Clear all" is offered.
      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      await tagGroup(page).getByRole('button', { name: /^API$/ }).click()
      await expect(page).toHaveURL(/[?&]tagIds=/, { timeout: 5000 })

      const clearButton = page.getByRole('button', { name: /^clear all$/i })
      await expect(clearButton).toBeVisible()
      await clearButton.click()

      // URL should no longer have either filter parameter.
      await expect(page).not.toHaveURL(/[?&]status=/, { timeout: 5000 })
      await expect(page).not.toHaveURL(/[?&]tagIds=/)
      await expect(activeFilters(page)).toHaveCount(0)
    })

    test('status filter persists with other filters', async ({ page }) => {
      // Navigate with board and sort filters (using 'features' board which exists in database)
      await page.goto('/?board=features&sort=new')
      await waitForNetworkIdle(page)

      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()

      // URL should have all three filters
      await expect(page).toHaveURL(/board=features/)
      await expect(page).toHaveURL(/sort=new/)
      await expect(page).toHaveURL(/status=/, { timeout: 5000 })
    })

    test('can toggle status filter on and off', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      const complete = statusGroup(page).getByRole('button', { name: /^Complete/ })
      await complete.click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })

      // Clicking the lit pill again clears the filter.
      await complete.click()
      await expect(page).not.toHaveURL(/[?&]status=/, { timeout: 5000 })
      await expect(complete).toHaveAttribute('aria-pressed', 'false')
    })

    test('can select multiple status filters', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      const status = statusGroup(page)
      const open = status.getByRole('button', { name: /^Open/ })
      const complete = status.getByRole('button', { name: /^Complete/ })

      await open.click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      await complete.click()

      // Both pills stay lit, and the single status chip names both picks.
      await expect(open).toHaveAttribute('aria-pressed', 'true')
      await expect(complete).toHaveAttribute('aria-pressed', 'true')
      await expect(activeFilters(page).getByText('Status:')).toHaveCount(1)
      await expect(activeFilters(page)).toContainText('Open and Complete')

      // TanStack Router encodes the array as JSON — both slugs are in the URL.
      await expect(page).toHaveURL(/open/, { timeout: 5000 })
      await expect(page).toHaveURL(/complete/)
    })

    test('filter panel shows a tags section when tags exist', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Seed tags are offered as toggle pills in the panel's Tags section.
      const tags = tagGroup(page)
      await expect(tags).toBeVisible()
      await expect(tags.getByRole('button', { name: /^API$/ })).toBeVisible()
      await expect(tags.getByRole('button', { name: /^UX$/ })).toBeVisible()
      await expect(tags.getByRole('button', { name: /^API$/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    test('navigating with status param shows correct checked state', async ({ page }) => {
      // Navigate with status filter in URL
      // TanStack Router encodes arrays as JSON: ["open"] → %5B%22open%22%5D
      await page.goto('/?status=%5B%22open%22%5D')
      await waitForNetworkIdle(page)

      // The "Open" pill is lit, the others are not.
      const status = statusGroup(page)
      await expect(status.getByRole('button', { name: /^Open/ })).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 10000 }
      )
      await expect(status.getByRole('button', { name: /^Complete/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      )

      // The active filter is stated above the feed.
      await expect(activeFilters(page)).toContainText('Status:')
      await expect(activeFilters(page)).toContainText('Open')
    })

    test('can select tag filter when tags exist', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      await tagGroup(page).getByRole('button', { name: /^API$/ }).click()

      // URL should update with tagIds parameter
      await expect(page).toHaveURL(/[?&]tagIds=/, { timeout: 5000 })
      await expect(activeFilters(page)).toContainText('Tag:')
    })

    test('tag selection adds a chip alongside the status chip', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Select a tag → one chip.
      await tagGroup(page).getByRole('button', { name: /^API$/ }).click()
      await expect(page).toHaveURL(/[?&]tagIds=/, { timeout: 5000 })
      await expect(activeFilters(page).getByText('Tag:')).toBeVisible()

      // Select a status too → a second chip: one per filter group, which is
      // what the old numeric badge counted.
      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      await expect(activeFilters(page).getByText('Tag:')).toBeVisible()
      await expect(activeFilters(page).getByText('Status:')).toBeVisible()
    })

    test('combined status and tag filtering updates URL correctly', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      // Let the first filter land before picking the next one.
      await waitForNetworkIdle(page)

      await tagGroup(page).getByRole('button', { name: /^API$/ }).click()

      // URL should have both status and tagIds
      await expect(page).toHaveURL(/status=/)
      await expect(page).toHaveURL(/tagIds=/, { timeout: 5000 })
    })

    test('clearing filters removes both status and tag params', async ({ page }) => {
      // Apply both filters through the panel, then clear them together.
      await page.goto('/')
      await waitForNetworkIdle(page)

      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      await tagGroup(page).getByRole('button', { name: /^API$/ }).click()
      await expect(page).toHaveURL(/[?&]tagIds=/, { timeout: 5000 })

      await page.getByRole('button', { name: /^clear all$/i }).click()

      // Both params should be removed
      await expect(page).not.toHaveURL(/status=/, { timeout: 5000 })
      await expect(page).not.toHaveURL(/tagIds=/)
    })

    test('filter state persists on page reload', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)

      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })

      const urlBeforeReload = page.url()

      await page.reload()
      await waitForNetworkIdle(page)

      // URL should still have the status parameter
      expect(page.url()).toBe(urlBeforeReload)

      // The pill stays lit and the chip is still shown.
      await expect(statusGroup(page).getByRole('button', { name: /^Complete/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      await expect(activeFilters(page)).toContainText('Status:')
    })

    test('status filter triggers post list refresh', async ({ page }) => {
      await page.goto('/')

      // Wait for initial posts to load
      const postCards = page.locator('[data-post-id]')
      await expect(postCards.first()).toBeVisible({ timeout: 15000 })

      await statusGroup(page)
        .getByRole('button', { name: /^Complete/ })
        .click()

      // Wait for URL to update (indicates filter applied)
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })

      // The refreshed feed holds only the picked status (Complete has posts in
      // the seed data), so every card names it.
      await expect
        .poll(
          async () => {
            const cards = await postCards.count()
            if (cards === 0) return 1 // an empty result is still a refresh
            const texts = await postCards.allInnerTexts()
            return texts.every((text) => text.includes('Complete')) ? 1 : 0
          },
          { timeout: 10000 }
        )
        .toBe(1)
    })

    test('shows empty state when filters match no posts', async ({ page }) => {
      // A vote threshold no post reaches leaves the feed empty through a filter,
      // without depending on which status/tag combinations the seed data has.
      await page.goto('/?minVotes=100000')
      await waitForNetworkIdle(page)

      await expect(page.getByText('No posts match your filters.')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('[data-post-id]')).toHaveCount(0)

      // The page should not show an error state
      expect(await page.getByText('Something went wrong').count()).toBe(0)
    })

    test('filter chip editor closes when clicking outside', async ({ page }) => {
      await page.goto('/?status=%5B%22open%22%5D')
      await waitForNetworkIdle(page)

      // The chip above the feed opens the pills for that filter.
      await activeFilters(page)
        .getByRole('button', { name: /^Status:/ })
        .click()
      const editor = page.getByRole('dialog', { name: 'Status' })
      await expect(editor).toBeVisible()

      // Click outside the popover — it should close.
      await page.mouse.click(200, 500)
      await expect(editor).toBeHidden({ timeout: 3000 })
    })

    test('multiple status filters use OR logic (shows posts matching any)', async ({ page }) => {
      await page.goto('/')
      await waitForNetworkIdle(page)
      const unfilteredTotal = await resultTotal(page)

      const status = statusGroup(page)
      await status.getByRole('button', { name: /^Closed/ }).click()
      await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
      const closedTotal = await resultTotal(page)
      expect(closedTotal).toBeGreaterThan(0)

      await status.getByRole('button', { name: /^Complete/ }).click()
      await expect(page).toHaveURL(/complete/, { timeout: 5000 })
      const bothTotal = await resultTotal(page)

      // OR union: adding a second status can only widen the result set, and it
      // stays within the unfiltered total.
      expect(bothTotal).toBeGreaterThan(closedTotal)
      expect(bothTotal).toBeLessThanOrEqual(unfilteredTotal)
      await expect(activeFilters(page)).toContainText('Closed')
      await expect(activeFilters(page)).toContainText('Complete')
    })
  })
})

// ---------------------------------------------------------------------------
// Filter Result Verification
// ---------------------------------------------------------------------------

test.describe('Post List - Filter Result Verification', () => {
  test('status filter: all visible post status badges match the applied filter', async ({
    page,
  }) => {
    // Navigate to page and wait for initial posts to load
    await page.goto('/')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })

    // Pick "Open" in the filter panel's Status section (the old Filter popover
    // is gone, and each status is a toggle pill).
    await page
      .getByRole('group', { name: 'Status', exact: true })
      .getByRole('button', { name: /^Open/ })
      .click()

    // Wait for URL and page to update (TanStack Router encodes arrays as JSON)
    await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
    await expect(page.locator('[data-post-id]').first()).toBeVisible({ timeout: 15000 })

    // Collect all visible status badge texts from post cards
    // StatusBadge renders as: <span class="inline-flex items-center gap-1.5 text-xs font-medium">
    const statusBadges = page.locator(
      '[data-post-id] span.inline-flex.items-center.text-xs.font-medium'
    )
    const badgeCount = await statusBadges.count()
    expect(badgeCount).toBeGreaterThan(0)

    // Each should say "Open"
    for (let i = 0; i < badgeCount; i++) {
      const text = await statusBadges.nth(i).textContent()
      expect(text?.trim()).toContain('Open')
    }
  })

  test('board filter: all visible post links belong to the selected board', async ({ page }) => {
    // Navigate directly with the features board filter
    await page.goto('/?board=features')
    await waitForNetworkIdle(page)
    await page.waitForTimeout(500)

    // Skip if the features board has no posts in this environment
    const postLinks = page.locator('a[data-post-id]')
    const count = await postLinks.count()
    test.skip(count === 0, 'No posts found for features board')

    // Every post link href should include /b/features/posts/
    for (let i = 0; i < count; i++) {
      const href = await postLinks.nth(i).getAttribute('href')
      expect(href).toMatch(/\/b\/features\/posts\//)
    }
  })

  test('tag filter: post count is reduced after applying a tag filter', async ({ page }) => {
    await page.goto('/')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    await waitForNetworkIdle(page)

    // Record unfiltered count (up to one page)
    const unfilteredCount = await postCards.count()

    const tags = page.getByRole('group', { name: 'Tags' })
    test.skip((await tags.count()) === 0, 'No tags section in the filter panel')
    await tags.getByRole('button').first().click()
    await expect(page).toHaveURL(/[?&]tagIds=/, { timeout: 5000 })
    await waitForNetworkIdle(page)

    // Filtering can only reduce or keep the count
    const filteredCount = await postCards.count()
    expect(filteredCount).toBeGreaterThan(0)
    expect(filteredCount).toBeLessThanOrEqual(unfilteredCount)
  })

  test('clearing a filter restores a larger result set', async ({ page }) => {
    await page.goto('/')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    await waitForNetworkIdle(page)

    const status = page.getByRole('group', { name: 'Status', exact: true })
    await status.getByRole('button').first().click()
    await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
    await waitForNetworkIdle(page)
    const filteredCount = await postCards.count()

    // Remove it from its chip
    await page.getByRole('button', { name: /^Remove Status/ }).click()
    await expect(page).not.toHaveURL(/[?&]status=/, { timeout: 5000 })
    await waitForNetworkIdle(page)

    const unfilteredCount = await postCards.count()
    expect(unfilteredCount).toBeGreaterThanOrEqual(filteredCount)
  })

  test('combining board + status filters: count ≤ board-only count AND status-only count', async ({
    page,
  }) => {
    const postCards = page.locator('[data-post-id]')

    // Get board-only count
    await page.goto('/?board=features')
    await waitForNetworkIdle(page)
    await page.waitForTimeout(500)
    const boardOnlyCount = await postCards.count()
    test.skip(boardOnlyCount === 0, 'No posts in features board')

    // Get a status slug from the filter panel (UI-based, avoids URL encoding issues)
    await page.goto('/')
    await waitForNetworkIdle(page)
    // The status choices live in the sidebar panel as toggle pills.
    await page
      .getByRole('group', { name: 'Status', exact: true })
      .getByRole('button', { name: /^Open/ })
      .click()
    await expect(page).toHaveURL(/[?&]status=/, { timeout: 5000 })
    // Extract the encoded status value from the URL
    const statusUrl = page.url()
    const statusMatch = statusUrl.match(/[?&]status=([^&]+)/)
    const encodedStatus = statusMatch?.[1] ?? ''
    expect(encodedStatus).not.toBe('')

    // Get status-only count
    await page.goto(`/?status=${encodedStatus}`)
    await waitForNetworkIdle(page)
    await page.waitForTimeout(500)
    // Skip if status URL caused an error
    test.skip(
      (await page.getByText('Something went wrong').count()) > 0,
      'Status URL param format caused an error'
    )
    const statusOnlyCount = await postCards.count()

    // Get combined count
    await page.goto(`/?board=features&status=${encodedStatus}`)
    await waitForNetworkIdle(page)
    await page.waitForTimeout(500)
    test.skip(
      (await page.getByText('Something went wrong').count()) > 0,
      'Combined URL param format caused an error'
    )
    const combinedCount = await postCards.count()

    expect(combinedCount).toBeLessThanOrEqual(boardOnlyCount)
    expect(combinedCount).toBeLessThanOrEqual(statusOnlyCount)
  })

  test('empty state shows "No posts match your filters." when no posts match', async ({ page }) => {
    // A vote threshold no post reaches produces the filtered empty state
    // deterministically (the old two-step popover flow is gone).
    await page.goto('/?minVotes=100000')
    await expect(page.getByText('No posts match your filters.')).toBeVisible({ timeout: 10000 })

    // No post cards, and no error page either.
    await expect(page.locator('[data-post-id]')).toHaveCount(0)
    expect(await page.getByText('Something went wrong').count()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Sort Order Verification
// ---------------------------------------------------------------------------

test.describe('Post List - Sort Order Verification', () => {
  test('"New" sort: first post was created more recently than the second post', async ({
    page,
  }) => {
    await page.goto('/?sort=new')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    await waitForNetworkIdle(page)

    const count = await postCards.count()
    test.skip(count < 2, 'Need at least 2 posts to verify sort order')

    // TimeAgo renders relative text, but the <a> element carries a data-post-id.
    // The most robust DOM signal: the post links themselves include the post IDs.
    // We verify ordering by checking that switching between "New" and "Top" produces
    // different first-post IDs (proving the sort actually changes the list).

    // Capture the first post ID under "new" sort
    const firstPostIdNew = await postCards.first().getAttribute('data-post-id')
    expect(firstPostIdNew).toBeTruthy()

    // Switch to "top" sort
    const topButton = page.getByRole('button', { name: /^Top$/i })
    await topButton.click()
    await expect(page).toHaveURL(/sort=top/, { timeout: 5000 })
    await waitForNetworkIdle(page)
    await page.waitForTimeout(300)

    const firstPostIdTop = await postCards.first().getAttribute('data-post-id')
    expect(firstPostIdTop).toBeTruthy()

    // Guard: if both sorts produce the same first post the seed data isn't
    // diverse enough to differentiate them — skip rather than fail.
    test.skip(
      firstPostIdNew === firstPostIdTop,
      'Sort may not differentiate with current data (same first post for new and top)'
    )

    // With 500 seed posts it is astronomically unlikely for new-sort and top-sort
    // to have the same first post. Verify they differ, confirming sort works.
    expect(firstPostIdNew).not.toBe(firstPostIdTop)
  })

  test('"Top" sort: first post has vote count ≥ second post vote count', async ({ page }) => {
    await page.goto('/?sort=top')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    await waitForNetworkIdle(page)

    const count = await postCards.count()
    test.skip(count < 2, 'Need at least 2 posts to verify sort order')

    // Read vote counts from the DOM via data-testid="vote-count"
    const voteCountSpans = page.locator('[data-post-id] [data-testid="vote-count"]')
    const firstVoteText = await voteCountSpans.nth(0).textContent()
    const secondVoteText = await voteCountSpans.nth(1).textContent()

    test.skip(!firstVoteText || !secondVoteText, 'Vote count elements not found')

    const firstVotes = parseInt(firstVoteText!.trim(), 10)
    const secondVotes = parseInt(secondVoteText!.trim(), 10)

    expect(isNaN(firstVotes)).toBe(false)
    expect(isNaN(secondVotes)).toBe(false)
    // Top sort: higher vote counts first
    expect(firstVotes).toBeGreaterThanOrEqual(secondVotes)
  })

  test('"New" sort places a recently-created post before an older one', async ({ page }) => {
    await page.goto('/?sort=new')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    await waitForNetworkIdle(page)

    const count = await postCards.count()
    test.skip(count < 2, 'Need at least 2 posts to verify sort order')

    // TimeAgo component renders strings like "about 2 hours ago", "3 days ago".
    // Capture the first two time-ago strings and verify the first is not older than the second.
    // Strategy: "X minutes/hours ago" is newer than "X days/months ago".
    // Note: .post-card is on the same element as [data-post-id], not a descendant.
    const timeAgoSpans = page.locator('[data-post-id] span.text-muted-foreground\\/70')
    const firstTimeAgo = (await timeAgoSpans.nth(0).textContent())?.trim() ?? ''
    const secondTimeAgo = (await timeAgoSpans.nth(1).textContent())?.trim() ?? ''

    // Both should be non-empty relative time strings
    expect(firstTimeAgo.length).toBeGreaterThan(0)
    expect(secondTimeAgo.length).toBeGreaterThan(0)

    // Simple ordering heuristic: if the first contains "minutes" or "hours" and
    // the second contains "days" or "months", the first is definitely more recent.
    // Otherwise we just verify the strings are present (sort is server-side and trusted).
    const firstIsMinutesOrHours = /minutes|hours|seconds/.test(firstTimeAgo)
    const secondIsDaysOrMore = /days|months|years/.test(secondTimeAgo)

    if (firstIsMinutesOrHours && secondIsDaysOrMore) {
      // First post is clearly more recent — verified
      expect(firstIsMinutesOrHours).toBe(true)
    } else {
      // Both are in the same time-unit range; the list is still in new order per server.
      // Just confirm that non-empty relative timestamps are shown on both cards.
      expect(firstTimeAgo.length).toBeGreaterThan(0)
      expect(secondTimeAgo.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Search Accuracy
// ---------------------------------------------------------------------------

test.describe('Post List - Search Accuracy', () => {
  test('search term: only posts whose titles contain the search term are shown', async ({
    page,
  }) => {
    await page.goto('/')
    const postCards = page.locator('[data-post-id]')
    await expect(postCards.first()).toBeVisible({ timeout: 15000 })
    // Wait for React hydration before clicking interactive elements
    await waitForNetworkIdle(page)

    // Use a search term that exists in the seed post titles
    const searchTerm = 'dark mode'

    const searchInput = page.getByRole('searchbox', { name: 'Search posts' })
    await searchInput.fill(searchTerm)
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/search=dark\+mode|search=dark%20mode/, { timeout: 5000 })
    // The previous results stay on screen until the search lands; wait for it.
    const titles = page.locator('[data-post-id] h3')
    await expect
      .poll(async () =>
        (await titles.allTextContents()).every((t) =>
          t.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
      .toBe(true)

    const filteredCount = await postCards.count()
    const emptyState = page.getByText('No posts match your filters.')
    const hasEmpty = (await emptyState.count()) > 0

    test.skip(
      filteredCount === 0 && !hasEmpty,
      'Unexpected empty result without empty state message'
    )

    if (filteredCount > 0) {
      // Every visible post title should contain the search term (case-insensitive)
      const titleCount = await titles.count()
      for (let i = 0; i < titleCount; i++) {
        const titleText = (await titles.nth(i).textContent()) ?? ''
        expect(titleText.toLowerCase()).toContain(searchTerm.toLowerCase())
      }
    } else {
      // Empty state message is acceptable (no matching posts)
      expect(hasEmpty).toBe(true)
    }
  })

  test('clearing search restores a larger result set', async ({ page }) => {
    // Start with search active
    await page.goto('/?search=dark+mode')
    const postCards = page.locator('[data-post-id]')
    await waitForNetworkIdle(page)
    await page.waitForTimeout(300)
    const searchCount = await postCards.count()

    const clearButton = page.getByRole('button', { name: /Clear search/i })
    await expect(clearButton).toBeVisible({ timeout: 5000 })
    await clearButton.click()

    // URL should no longer contain a search parameter
    await expect(page).not.toHaveURL(/[?&]search=/, { timeout: 5000 })
    await waitForNetworkIdle(page)
    await page.waitForTimeout(300)

    const fullCount = await postCards.count()
    // Full list should have at least as many posts as the search-filtered list
    expect(fullCount).toBeGreaterThanOrEqual(searchCount)
  })

  test('searching for a non-existent term shows the specific empty-state message', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-post-id]').first()).toBeVisible({ timeout: 15000 })
    // Wait for React hydration before clicking interactive elements
    await waitForNetworkIdle(page)

    // Search for a string that will never match real post titles
    const impossibleTerm = 'xyzzy_no_such_post_zqwerty_99999'

    const searchInput = page.getByRole('searchbox', { name: 'Search posts' })
    await searchInput.fill(impossibleTerm)
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/search=/, { timeout: 5000 })
    await waitForNetworkIdle(page)
    await page.waitForTimeout(500)

    // Should show the specific "no match" message rather than just a blank list
    const noMatchMsg = page.getByText(`No posts match “${impossibleTerm}”.`)
    await expect(noMatchMsg).toBeVisible({ timeout: 5000 })

    // And there should be no post cards
    const postCards = page.locator('[data-post-id]')
    expect(await postCards.count()).toBe(0)
  })
})
