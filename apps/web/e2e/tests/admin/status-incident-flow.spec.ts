import { test, expect, type Page } from '@playwright/test'
import { getStatusIncident } from '../../utils/db-helpers'

/**
 * The Status product, end to end across both surfaces: an operator reports an
 * incident in the admin, the public status page shows it, and resolving it
 * publishes the resolution.
 *
 * `/admin/status` and `/status` had no e2e spec at all — the only status
 * coverage was the post-status settings page (`settings/statuses`), which is a
 * different feature. A seeded workspace starts with the Status product off
 * (`statusPage: false` in DEFAULT_FEATURE_FLAGS) and `/admin/status` redirects
 * to Feedback, so each test enables the module first via Settings → General.
 */
test.describe('Status incidents', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  /**
   * A seeded workspace has the Status product disabled, so `/admin/status`
   * redirects away. Turn it on through Settings → General (idempotently: the
   * switch is left alone when it is already on) before exercising the status
   * surfaces.
   */
  async function ensureStatusProductEnabled(page: Page): Promise<void> {
    await page.goto('/admin/settings/general')
    const statusSwitch = page.getByRole('switch', { name: 'Status', exact: true })
    await expect(statusSwitch).toBeVisible({ timeout: 15_000 })
    if ((await statusSwitch.getAttribute('aria-checked')) !== 'true') {
      await statusSwitch.click()
      await expect(statusSwitch).toBeChecked({ timeout: 10_000 })
    }
  }

  /**
   * A seeded workspace has no status services, and the report dialog requires
   * at least one affected service before publishing. Create one through
   * Status → Services (idempotently: an existing service is left alone).
   */
  async function ensureStatusService(page: Page): Promise<void> {
    await page.goto('/admin/status?view=components')
    const addService = page.getByRole('button', { name: 'Add a service' })
    const serviceActions = page.getByRole('button', { name: 'Service actions' })
    await expect(addService.or(serviceActions.first())).toBeVisible({ timeout: 15_000 })
    if (!(await addService.isVisible().catch(() => false))) return

    await addService.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Name').fill('E2E Service')
    await dialog.getByRole('button', { name: 'Create service' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(addService).toBeHidden({ timeout: 15_000 })
  }

  /** Open the report dialog, fill the required fields and publish. */
  async function reportIncident(page: Page, title: string, body: string): Promise<void> {
    await ensureStatusProductEnabled(page)
    await ensureStatusService(page)
    await page.goto('/admin/status')

    const reportButton = page.getByRole('button', { name: 'Report incident' })
    await expect(reportButton).toBeVisible({ timeout: 15_000 })
    await reportButton.click()
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
    test.setTimeout(180_000)
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
      // /status lives under the portal layout, so another spec's recent
      // visibility write can still be in effect for a few seconds
      // (SETTINGS_LOCAL_TTL_MS) and render the private-portal gate. Retry until
      // the public status page actually renders the incident.
      await expect(async () => {
        await publicPage.goto('/status')
        await expect(publicPage.getByText(/this portal is private/i)).toHaveCount(0)
        await expect(publicPage.getByText(title).first()).toBeVisible({ timeout: 5000 })
      }).toPass({ timeout: 45_000 })
      await expect(publicPage.getByText(/investigating/i).first()).toBeVisible()

      // Operator resolves it: pick the final step, post the update through the
      // one footer action that both posts and transitions.
      await page.goto(`/admin/status?incident=${incident.incidentId}`)
      // The lifecycle stepper's options are radios named "<step number>
      // <stage>", so match the stage text rather than the start of the name.
      const resolvedRadio = page.getByRole('radio', { name: /resolved/i })
      await expect(resolvedRadio).toBeVisible({ timeout: 15_000 })
      await resolvedRadio.click()
      await page
        .getByPlaceholder("What's the latest? This appears on the public status page.")
        .fill('The rollback is complete and error rates are back to normal.')
      await page.getByRole('button', { name: 'Post update & resolve' }).click()
      await expect(page.getByText('Update posted')).toBeVisible({ timeout: 20_000 })

      await expect.poll(() => getStatusIncident(title).status, { timeout: 15_000 }).toBe('resolved')

      // Public: the incident's own page now reads as resolved.
      await expect(async () => {
        await publicPage.goto(`/status/${incident.incidentId}`)
        await expect(publicPage.getByText(title).first()).toBeVisible({ timeout: 5000 })
      }).toPass({ timeout: 30_000 })
      await expect(publicPage.getByText(/resolved/i).first()).toBeVisible()
      await expect(
        publicPage.getByText('The rollback is complete and error rates are back to normal.')
      ).toBeVisible({ timeout: 15_000 })
    } finally {
      await publicContext.close()
    }
  })

  test('reporting an incident needs a title, a description and a service', async ({ page }) => {
    await ensureStatusProductEnabled(page)
    await ensureStatusService(page)
    await page.goto('/admin/status')

    const reportButton = page.getByRole('button', { name: 'Report incident' })
    await expect(reportButton).toBeVisible({ timeout: 15_000 })
    await reportButton.click()
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
