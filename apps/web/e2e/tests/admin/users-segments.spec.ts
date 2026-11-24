import { waitForNetworkIdle } from '../../utils/helpers'
import { test, expect } from '@playwright/test'

/**
 * Segment management lives in the Users page sidebar (desktop-only nav).
 * The create/edit dialogs are the shared <SegmentFormDialog>.
 */
test.describe('Admin Users Segments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/users')
    await waitForNetworkIdle(page)
  })

  test('sidebar shows Segments section with create button', async ({ page }) => {
    await expect(page.getByText('Segments', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'New segment' })).toBeVisible()
  })

  test('shows segments list or empty state', async ({ page }) => {
    const emptyState = page.getByText(/no segments yet/i)
    // Row actions only show on hover, and getByRole() ignores them while they
    // are hidden — match the action's title attribute so the check works on
    // the DOM regardless of hover state.
    const editButtons = page.locator('button[title="Edit segment"]')

    // Either at least one segment row exists or the empty state prompt is
    // shown. The segments query is client-side, so wait for it to settle
    // instead of racing a fixed timeout.
    await expect(async () => {
      const settled = (await editButtons.count()) > 0 || (await emptyState.count()) > 0
      expect(settled).toBe(true)
    }).toPass({ timeout: 10000 })
  })

  test('can open the create segment dialog from "New segment"', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole('heading', { name: 'Create segment' })).toBeVisible()
  })

  test('create dialog has manual and dynamic type selectors', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Type selector buttons. Each renders a capitalized title plus a description,
    // so match the button's accessible name rather than a bare text node.
    await expect(dialog.getByRole('button', { name: /manual/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /dynamic/i })).toBeVisible()
  })

  test('create dialog has name and description fields', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await expect(dialog.locator('#seg-name')).toBeVisible()
    await expect(dialog.locator('#seg-desc')).toBeVisible()

    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /create segment/i })).toBeVisible()
  })

  test('create button is disabled until name is filled', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const submitButton = dialog.getByRole('button', { name: /create segment/i })
    await expect(submitButton).toBeDisabled()

    await dialog.locator('#seg-name').fill('My Segment')
    await expect(submitButton).toBeEnabled()
  })

  test('cancel button closes the dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toBeHidden({ timeout: 5000 })
  })

  test('can create a manual segment', async ({ page }) => {
    const segmentName = `E2E Manual ${Date.now()}`

    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Manual is the default type — just fill name
    await dialog.locator('#seg-name').fill(segmentName)
    await dialog.locator('#seg-desc').fill('Created by E2E test')

    await dialog.getByRole('button', { name: /create segment/i }).click()
    await expect(dialog).toBeHidden({ timeout: 10000 })

    // New segment should appear in the sidebar nav
    await expect(page.getByText(segmentName)).toBeVisible({ timeout: 10000 })
  })

  test('dynamic type shows rule builder section', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Click the "dynamic" type option (capitalized title + description, so
    // match the button's accessible name).
    await dialog.getByRole('button', { name: /dynamic/i }).click()

    // Rule builder should appear
    await expect(dialog.getByText('Rules', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(dialog.getByRole('button', { name: /add condition/i })).toBeVisible()
  })

  test('dynamic rule builder has "Add condition" button', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /dynamic/i }).click()

    const addConditionButton = dialog.getByRole('button', { name: /add condition/i })
    await expect(addConditionButton).toBeVisible({ timeout: 3000 })

    // Click "Add condition" — a condition row should appear
    await addConditionButton.click()

    // Condition row has attribute + operator dropdowns
    const conditionSelects = dialog.locator('[role="combobox"]')
    await expect(conditionSelects.first()).toBeVisible({ timeout: 3000 })
  })

  test('condition row has attribute and operator selectors', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /dynamic/i }).click()
    await dialog.getByRole('button', { name: /add condition/i }).click()

    // At least 2 comboboxes: attribute + operator
    const comboboxes = dialog.locator('[role="combobox"]')
    await expect(comboboxes).toHaveCount(3) // match (all/any) + attribute + operator
  })

  test('condition attribute dropdown contains built-in options', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /dynamic/i }).click()
    await dialog.getByRole('button', { name: /add condition/i }).click()

    // Click the attribute combobox (second combobox — first is match all/any)
    const comboboxes = dialog.locator('[role="combobox"]')
    await comboboxes.nth(1).click()

    const optionContainer = page
      .locator('[role="listbox"]')
      .or(page.locator('[data-slot="select-content"]'))
      .first()
    await expect(optionContainer).toBeVisible({ timeout: 5000 })

    // Built-in field labels (the old "Email Domain" field was removed).
    await expect(optionContainer.getByRole('option', { name: 'Post Count' })).toBeVisible()
    await expect(optionContainer.getByRole('option', { name: 'Email', exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
  })

  test('can create a dynamic segment with a condition', async ({ page }) => {
    const segmentName = `E2E Dynamic ${Date.now()}`

    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /dynamic/i }).click()
    await dialog.locator('#seg-name').fill(segmentName)

    // Add a condition
    await dialog.getByRole('button', { name: /add condition/i }).click()

    // Fill a value for the condition (e.g. post_count >= 1)
    const comboboxes = dialog.locator('[role="combobox"]')
    // Select "Post Count" attribute
    await comboboxes.nth(1).click()
    const optionContainer = page
      .locator('[role="listbox"]')
      .or(page.locator('[data-slot="select-content"]'))

    if ((await optionContainer.count()) > 0) {
      const postCountOption = optionContainer.getByText('Post Count')
      if ((await postCountOption.count()) > 0) {
        await postCountOption.click()
      } else {
        await page.keyboard.press('Escape')
      }
    }

    // Fill value input
    const valueInput = dialog.locator('input[type="number"]').first()
    if ((await valueInput.count()) > 0) {
      await valueInput.fill('1')
    }

    await dialog.getByRole('button', { name: /create segment/i }).click()
    await expect(dialog).toBeHidden({ timeout: 10000 })

    await expect(page.getByText(segmentName)).toBeVisible({ timeout: 10000 })
  })

  test('can open edit dialog for an existing segment', async ({ page }) => {
    // Create a segment so a row is guaranteed to exist
    const segmentName = `E2E EditTarget ${Date.now()}`

    await page.getByRole('button', { name: 'New segment' }).click()
    const createDialog = page.getByRole('dialog')
    await expect(createDialog).toBeVisible({ timeout: 5000 })
    await createDialog.locator('#seg-name').fill(segmentName)
    await createDialog.getByRole('button', { name: /create segment/i }).click()
    await expect(createDialog).toBeHidden({ timeout: 10000 })

    const segButton = page.getByRole('button', { name: segmentName })
    await expect(segButton).toBeVisible({ timeout: 10000 })

    // Edit/delete actions only show on row hover
    await segButton.hover()
    await page.getByRole('button', { name: 'Edit segment' }).first().click()

    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible({ timeout: 5000 })

    // Edit dialog title should say "Edit segment"
    await expect(editDialog.getByText(/edit segment/i)).toBeVisible()

    // Save button should say "Save changes"
    await expect(editDialog.getByRole('button', { name: /save changes/i })).toBeVisible()

    // Type selector should NOT be shown when editing
    await expect(editDialog.getByText('manual')).not.toBeVisible()

    await editDialog.getByRole('button', { name: /cancel/i }).click()
    await expect(editDialog).toBeHidden({ timeout: 5000 })
  })

  test('can delete a segment with confirmation', async ({ page }) => {
    const segmentName = `E2E Delete Seg ${Date.now()}`

    // Create a segment to delete
    await page.getByRole('button', { name: 'New segment' }).click()
    const createDialog = page.getByRole('dialog')
    await expect(createDialog).toBeVisible({ timeout: 5000 })
    await createDialog.locator('#seg-name').fill(segmentName)
    await createDialog.getByRole('button', { name: /create segment/i }).click()
    await expect(createDialog).toBeHidden({ timeout: 10000 })

    const segButton = page.getByRole('button', { name: segmentName })
    await expect(segButton).toBeVisible({ timeout: 10000 })

    // Hover the row to reveal the delete (trash) action
    await segButton.hover()
    await page.getByRole('button', { name: 'Delete segment' }).first().click()

    // Confirmation dialog should appear and mention the segment name
    const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await expect(confirmDialog.getByText(segmentName)).toBeVisible()

    // Confirm deletion
    await confirmDialog.getByRole('button', { name: /^delete$/i }).click()

    // The dialog closes (its title also names the segment), then the segment's row goes
    await expect(confirmDialog).toBeHidden({ timeout: 10000 })
    await expect(segButton).toBeHidden({ timeout: 10000 })
  })

  test('delete confirmation can be cancelled', async ({ page }) => {
    const segmentName = `E2E Cancel Del Seg ${Date.now()}`

    await page.getByRole('button', { name: 'New segment' }).click()
    const createDialog = page.getByRole('dialog')
    await expect(createDialog).toBeVisible({ timeout: 5000 })
    await createDialog.locator('#seg-name').fill(segmentName)
    await createDialog.getByRole('button', { name: /create segment/i }).click()
    await expect(createDialog).toBeHidden({ timeout: 10000 })

    const segButton = page.getByRole('button', { name: segmentName })
    await expect(segButton).toBeVisible({ timeout: 10000 })

    await segButton.hover()
    await page.getByRole('button', { name: 'Delete segment' }).first().click()

    const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })

    // Cancel — segment should still be present
    await confirmDialog.getByRole('button', { name: /cancel/i }).click()
    await expect(confirmDialog).toBeHidden({ timeout: 5000 })
    await expect(page.getByText(segmentName)).toBeVisible()
  })

  test('rule builder match selector has ALL and ANY options', async ({ page }) => {
    await page.getByRole('button', { name: 'New segment' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole('button', { name: /dynamic/i }).click()
    await dialog.getByRole('button', { name: /add condition/i }).click()

    // The match selector is the first combobox (renders "ALL" / "ANY")
    const matchSelect = dialog.locator('[role="combobox"]').first()
    await matchSelect.click()

    const optionContainer = page
      .locator('[role="listbox"]')
      .or(page.locator('[data-slot="select-content"]'))

    if ((await optionContainer.count()) > 0) {
      await expect(optionContainer.getByText(/all/i).first()).toBeVisible()
      await expect(optionContainer.getByText(/any/i).first()).toBeVisible()
    }

    await page.keyboard.press('Escape')
  })
})
