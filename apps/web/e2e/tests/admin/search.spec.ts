import { test, expect } from '@playwright/test'

/**
 * Workspace search: the Ctrl+K palette and the results page it opens.
 *
 * `/admin/search` had no spec. The palette had unit coverage for its
 * destination list, but nothing proved the two work together: type a query,
 * Enter opens the full results page, the page lists the matching records,
 * filters by kind, and answers the short-query and no-match states.
 *
 * The queries target the seeded demo dataset ("Dark mode support"), so no
 * fixtures are written.
 */
test.describe('Workspace search', () => {
  test('the palette opens and its first action opens the results page', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // The palette is opened from the sidebar's search row (same control the
    // shortcut fires), then typed into.
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const input = page.getByPlaceholder('Search Quackback')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('Dark mode')

    // The always-first item is the full-results action, so Enter goes there.
    await expect(page.getByText('Search for “Dark mode”')).toBeVisible({ timeout: 10_000 })
    await input.press('Enter')

    await expect(page).toHaveURL(/\/admin\/search\?q=Dark(\+|%20)mode/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible()
    await expect(page.getByText('Dark mode support').first()).toBeVisible({ timeout: 15_000 })
  })

  test('the results page filters by type and reports short and empty queries', async ({ page }) => {
    await page.goto('/admin/search?q=Dark%20mode')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Dark mode support').first()).toBeVisible({ timeout: 15_000 })

    // A type filter that cannot match the query shows the empty state instead
    // of the previous list.
    const filter = page.getByRole('group', { name: 'Filter by type' })
    await expect(filter).toBeVisible()
    await filter.getByRole('button', { name: 'People', exact: true }).click()
    await expect(page.getByText('No results for “Dark mode”')).toBeVisible({ timeout: 15_000 })

    // Below the minimum length the page asks for more characters.
    await page.goto('/admin/search?q=d')
    await expect(page.getByText('Type at least two characters.')).toBeVisible({ timeout: 15_000 })

    // A query that matches nothing says so with the query in it.
    await page.goto(`/admin/search?q=zzqx${Date.now()}`)
    await expect(page.getByText(/No results for “zzqx/)).toBeVisible({ timeout: 15_000 })
  })
})
