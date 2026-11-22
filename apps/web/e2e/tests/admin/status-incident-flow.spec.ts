import { test, expect } from '@playwright/test'
import { getStatusIncident } from '../../utils/db-helpers'

/**
 * The Status product, end to end across both surfaces: an operator reports an
 * incident in the admin, the public status page shows it, and resolving it
 * publishes the resolution.
 *
 * `/admin/status` and `/status` had no e2e spec at all — the only status
 * coverage was the post-status settings page (`settings/statuses`), which is a
 * different feature. The status page's feature flag (``statusPage``) is on in
 * the seed.
 */
test.describe('Status incidents', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  /** Open the report dialog, fill the required fields and publish. */
  async function reportIncident(
    page: import('@playwright/test').Page,
    title: string,
    body: string
  ): Promise<void> {
    await page.goto('/admin/status')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Report incident' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel("What's happening?").fill(body)

    // At least one affected service is required before publishing.
    await dialog.getByRole('checkbox').first().click()
    const publish = dialog.getByRole('button', { name: 'Publish incident' })
    await expect(publish).toBeEnabled()
    await publish.click()

    // Publishing closes the report dialog and opens the incident editor, so
    // the row is the stable signal that the create landed; dismiss whatever
    // modal is open before navigating on.
    await expect
      .poll(
        () => {
          try {
            return getStatusIncident(title).status
          } catch {
            return null
          }
        },
        { timeout: 30_000, intervals: [1000, 2000] }
      )
      .toBe('investigating')
    await page.keyboard.press('Escape')
  }

  test('an incident is reported, published publicly, then resolved', async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    const title = `E2E status incident ${Date.now()}`
    const body = 'Elevated error rates while we roll out a fix.'

    await reportIncident(page, title, body)

    const incident = getStatusIncident(title)
    expect(incident.status).toBe('investigating')

    // Public: the incident is live, with its investigating state.
    const publicContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const publicPage = await publicContext.newPage()
    try {
      await publicPage.goto('/status')
      await publicPage.waitForLoadState('networkidle')
      await expect(publicPage.getByText(title).first()).toBeVisible({ timeout: 15_000 })
      await expect(publicPage.getByText(/investigating/i).first()).toBeVisible()

      // Operator resolves it: pick the final step, post the update through the
      // one footer action that both posts and transitions.
      await page.goto(`/admin/status?incident=${incident.incidentId}`)
      await page.waitForLoadState('networkidle')
      // The lifecycle stepper's options are radios named "<step number>
      // <stage>", so match the stage text rather than the start of the name.
      await page.getByRole('radio', { name: /resolved/i }).click()
      await page
        .getByPlaceholder("What's the latest? This appears on the public status page.")
        .fill('The rollback is complete and error rates are back to normal.')
      await page.getByRole('button', { name: 'Post update & resolve' }).click()
      await expect(page.getByText('Update posted')).toBeVisible({ timeout: 20_000 })

      await expect.poll(() => getStatusIncident(title).status, { timeout: 15_000 }).toBe('resolved')

      // Public: the incident's own page now reads as resolved.
      await publicPage.goto(`/status/${incident.incidentId}`)
      await publicPage.waitForLoadState('networkidle')
      await expect(publicPage.getByText(title).first()).toBeVisible({ timeout: 15_000 })
      await expect(publicPage.getByText(/resolved/i).first()).toBeVisible()
      await expect(
        publicPage.getByText('The rollback is complete and error rates are back to normal.')
      ).toBeVisible({ timeout: 15_000 })
    } finally {
      await publicContext.close()
    }
  })

  test('reporting an incident needs a title, a description and a service', async ({ page }) => {
    await page.goto('/admin/status')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Report incident' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const publish = dialog.getByRole('button', { name: 'Publish incident' })
    await expect(publish).toBeDisabled()

    await dialog.getByLabel('Title').fill(`E2E guarded incident ${Date.now()}`)
    await expect(publish).toBeDisabled()

    await dialog.getByLabel("What's happening?").fill('A description is not enough on its own.')
    await expect(publish).toBeDisabled()

    // An affected service is what derives the incident's impact; without one
    // there is nothing to publish to the status page.
    await dialog.getByRole('checkbox').first().click()
    await expect(publish).toBeEnabled()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })
})
