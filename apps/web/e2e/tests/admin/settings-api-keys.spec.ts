import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from '../../utils/helpers'

/**
 * Settings > Developers > Keys.
 *
 * Creating a key moved out of a dialog: "New workspace key" is a link to
 * /admin/settings/developers/workspace-keys/new, a page with the name, the
 * key's role and its access. The secret is still revealed once, in the
 * "API key created" dialog, after the create page's form is submitted.
 */
const KEYS_PATH = '/admin/settings/developers?tab=keys'
const NEW_KEY_PATH = '/admin/settings/developers/workspace-keys/new'
const KEYS_URL = /\/admin\/settings\/developers\?tab=keys$/
const NEW_KEY_URL = /\/admin\/settings\/developers\/workspace-keys\/new$/

/** The one-time reveal dialog a created key shows. */
function revealDialog(page: Page) {
  return page.getByRole('dialog', { name: 'API key created' })
}

/** The row of an existing key, keyed by its name. */
function keyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

/** Create a workspace key through the create page and stop at the reveal dialog. */
async function createWorkspaceKey(page: Page, name: string): Promise<void> {
  await page.goto(NEW_KEY_PATH)
  // The form is client-rendered; filling before its handlers are attached
  // leaves React's state empty, so the Create button never enables.
  const nameInput = page.getByRole('textbox', { name: 'Name' })
  await waitForHydration(nameInput)
  await nameInput.fill(name)
  await page.getByRole('radio', { name: 'Manager', exact: true }).check()
  await page.getByRole('button', { name: 'Create key' }).click()
  await expect(revealDialog(page)).toBeVisible({ timeout: 15_000 })
}

test.describe('Admin API Keys Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(KEYS_PATH)
    // No networkidle: the admin shell keeps SSE streams open, so the network
    // never goes idle on an admin page.
    await expect(page.getByRole('heading', { name: 'Developers', level: 1 })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('displays API keys settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workspace keys', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Personal keys', exact: true })).toBeVisible()
  })

  test('shows the page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Developers', level: 1 })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('shows create API key button or empty state action', async ({ page }) => {
    // The card header link, repeated in the empty state. Creation opens a page
    // now, so the action is a link, not a dialog trigger.
    const createLinks = page.getByRole('link', { name: 'New workspace key' })

    await expect(createLinks.first()).toBeVisible({ timeout: 10_000 })
    await expect(createLinks.first()).toHaveAttribute('href', NEW_KEY_PATH)
  })

  test('can open create API key form', async ({ page }) => {
    await page.getByRole('link', { name: 'New workspace key' }).first().click()

    await expect(page).toHaveURL(NEW_KEY_URL, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'New workspace key', level: 1 })).toBeVisible()
  })

  test('create form has name input', async ({ page }) => {
    await page.goto(NEW_KEY_PATH)

    const nameInput = page.getByRole('textbox', { name: 'Name' })
    await waitForHydration(nameInput)

    // A key takes a role, chosen from the workspace's roles.
    await expect(page.getByRole('radio', { name: 'Manager', exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Nothing to create until a name and a role are chosen.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create key' })).toBeDisabled()
  })

  test('create form cancel returns to the keys list', async ({ page }) => {
    await page.goto(NEW_KEY_PATH)
    const cancel = page.getByRole('button', { name: 'Cancel' })
    await waitForHydration(cancel)

    await cancel.click()

    await expect(page).toHaveURL(KEYS_URL, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Workspace keys', exact: true })).toBeVisible()
  })

  test('created key is revealed once in a dialog with copy button', async ({ page }) => {
    const keyName = `E2E Key ${Date.now()}`

    await createWorkspaceKey(page, keyName)

    const dialog = revealDialog(page)
    // The dialog is the only place the secret is ever shown.
    await expect(dialog.getByText(/only time you'll see it/i)).toBeVisible()
    await expect(dialog.locator('code').filter({ hasText: /^qb_/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Copy to clipboard' })).toBeVisible()

    await dialog.getByRole('button', { name: "I've saved my key" }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    // Confirming returns to the list, where the key now appears.
    await expect(page).toHaveURL(KEYS_URL, { timeout: 15_000 })
    await expect(page.getByText(keyName)).toBeVisible({ timeout: 15_000 })
  })

  test('key list shows the key name, role, prefix and never used', async ({ page }) => {
    const keyName = `E2E List ${Date.now()}`

    await createWorkspaceKey(page, keyName)
    await revealDialog(page).getByRole('button', { name: "I've saved my key" }).click()
    await expect(page).toHaveURL(KEYS_URL, { timeout: 15_000 })

    const row = keyRow(page, keyName)
    await expect(row).toBeVisible({ timeout: 15_000 })
    // The prefix is the non-secret head of the key, shown in mono with "..." .
    await expect(row.locator('code')).toHaveText(/^qb_.{9}\.\.\.$/)
    await expect(row.getByText('Manager', { exact: true })).toBeVisible()
    await expect(row.getByText('Never', { exact: true })).toBeVisible()
  })

  test('can open revoke confirmation dialog for an existing key', async ({ page }) => {
    const keyName = `E2E Revoke ${Date.now()}`

    // Every run starts from a list with no keys, so create the one to revoke.
    await createWorkspaceKey(page, keyName)
    await revealDialog(page).getByRole('button', { name: "I've saved my key" }).click()
    await expect(page).toHaveURL(KEYS_URL, { timeout: 15_000 })

    const row = keyRow(page, keyName)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.hover()
    await row.getByRole('button', { name: `Actions for ${keyName}` }).click()
    await page.getByRole('menuitem', { name: 'Revoke' }).click()

    // Confirmation dialog, with the warning that revocation is permanent.
    const confirmDialog = page.getByRole('alertdialog', { name: 'Revoke API key' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(confirmDialog.getByText(/cannot be undone/i)).toBeVisible()

    // Cancel the revocation
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirmDialog).toBeHidden({ timeout: 5_000 })
    await expect(row).toBeVisible()
  })

  test('shows the base URL and API reference link', async ({ page }) => {
    await expect(page.getByText('Base URL', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /open api reference/i })).toHaveAttribute(
      'href',
      '/api/v1/docs'
    )
  })
})
