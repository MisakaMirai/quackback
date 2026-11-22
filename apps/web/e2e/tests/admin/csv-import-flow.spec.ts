import { test, expect, type Page } from '@playwright/test'
import { getImportedPosts } from '../../utils/db-helpers'

/**
 * The CSV import flow: upload the template-shaped file, review the dry run,
 * commit, and land the rows as real posts.
 *
 * `/admin/settings/imports` had no e2e coverage. The flow is a three-step
 * server contract (dry-run preview -> 202 commit -> polled run), and the only
 * way to check that contract end to end is to drive the file input.
 */
test.describe('CSV import', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  const HEADER =
    'title,content,status,tags,board,author_name,author_email,email_verified,vote_count,created_at,source_id'

  async function uploadCsv(page: Page, name: string, csv: string): Promise<void> {
    await page.goto('/admin/settings/imports')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })
  }

  test('a CSV previews, commits and lands as posts', async ({ page }) => {
    test.setTimeout(120_000)
    const stamp = Date.now()
    const titleOne = `E2E import one ${stamp}`
    const titleTwo = `E2E import two ${stamp}`
    const boardName = `E2E Imports ${stamp}`

    await uploadCsv(
      page,
      'e2e-import.csv',
      [
        HEADER,
        `"${titleOne}","Body one","open","","${boardName}","E2E Import Author","e2e-import@example.test","false","1","",""`,
        `"${titleTwo}","Body two","open","","${boardName}","E2E Import Author","e2e-import@example.test","false","0","",""`,
      ].join('\n')
    )

    // Dry run: both rows are new, and the unknown board is announced before
    // anything is written.
    await expect(page.getByText(/2 rows: 2 new posts, 0 updates, 0 skipped/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(titleOne).first()).toBeVisible()
    await expect(page.getByText(titleTwo).first()).toBeVisible()
    await expect(page.getByText(`${boardName} (board)`)).toBeVisible()

    await page.getByRole('button', { name: 'Import 2 posts' }).click()
    await expect(page.getByText('Import complete')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('2 created.').first()).toBeVisible()

    // The rows are real posts, in the board the CSV named.
    await expect
      .poll(
        () => {
          try {
            return getImportedPosts(`E2E import`).filter((p) => p.title.endsWith(String(stamp)))
              .length
          } catch {
            return 0
          }
        },
        { timeout: 20_000 }
      )
      .toBe(2)
    const imported = getImportedPosts('E2E import').filter((p) => p.title.endsWith(String(stamp)))
    expect(imported.map((p) => p.title).sort()).toEqual([titleOne, titleTwo].sort())
    expect(imported.every((p) => p.boardName === boardName)).toBe(true)
  })

  test('a row without a title is reported in the preview and never imported', async ({ page }) => {
    const stamp = Date.now()
    const prefix = `E2E import bad ${stamp}`
    await uploadCsv(
      page,
      'e2e-bad-import.csv',
      [
        HEADER,
        `"","No title, so this row cannot become a post ${prefix}","open","","","E2E Import Author","e2e-import@example.test","false","0","",""`,
      ].join('\n')
    )

    // The dry run refuses the row with the field it is missing, rather than
    // importing a blank-titled post.
    await expect(page.getByText(/1 rows: 0 new posts, 0 updates, 1 skipped/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/Row 1: Title is required/)).toBeVisible()

    // Committing it still produces no posts: the skipped row stays skipped.
    await page.getByRole('button', { name: 'Import 0 posts' }).click()
    await expect(page.getByText('Import complete')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/^0 created/).first()).toBeVisible()
    expect(getImportedPosts(prefix)).toHaveLength(0)
  })
})
