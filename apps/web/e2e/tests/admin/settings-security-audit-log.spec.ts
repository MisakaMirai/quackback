import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { clearSigninRateLimit, enableMagicLinkMethod } from '../../utils/db-helpers'

/**
 * The admin audit log — the security-observability surface every other
 * security flow writes into.
 *
 * No spec touched `/admin/settings/security/authentication?tab=audit-log`.
 * This drives it from a real recorded event: a sign-in address that trips the
 * magic-link rate limit (the hook records `auth.signin.rate_limited` before it
 * answers 429), then reads the row back through the page's filters and the CSV
 * export.
 */
test.describe('Admin audit log', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test.beforeAll(() => {
    enableMagicLinkMethod()
    clearSigninRateLimit()
  })

  test.afterAll(() => {
    clearSigninRateLimit()
  })

  test('a rate-limited sign-in is recorded, filterable and exportable', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    const email = `e2e-audit-${Date.now()}@example.test`
    // A cookieless request context: this is the anonymous sign-in attempt the
    // rate limiter answers, not the admin's own session. The Origin header is
    // what Better-Auth's request check expects.
    const send = () =>
      request.post('/api/auth/sign-in/magic-link', {
        headers: { Origin: new URL(baseURL!).origin },
        data: { email, callbackURL: '/' },
      })

    // 3/15min per (ip, email): the fourth is refused, and the refusal is
    // written to the audit log before the 429 goes out.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect((await send()).status(), `send ${attempt} within budget`).toBe(200)
    }
    expect((await send()).status()).toBe(429)

    await page.goto('/admin/settings/security/authentication?tab=audit-log')
    await page.waitForLoadState('networkidle')

    // Filter by the actor address the (failed) sign-in carried.
    const filter = page.getByRole('searchbox', { name: 'Filter audit events by actor email' })
    const eventRow = page.getByText('auth.signin.rate_limited').first()
    await expect(async () => {
      await filter.fill(email)
      await expect(eventRow).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })

    const table = page.getByRole('table')
    await expect(table.getByText(email).first()).toBeVisible()
    await expect(table.getByText(/^failure$/i).first()).toBeVisible()

    // CSV export covers the same filtered window, with the forensic columns.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/)
    const csvPath = await download.path()
    const csv = readFileSync(csvPath!, 'utf8')
    expect(csv.split('\n')[0]).toBe(
      'occurred_at,event_type,outcome,actor_email,actor_role,actor_type,auth_method,actor_ip,target_type,target_id,request_id,metadata,channel,credential_kind,credential_id,client_name,on_behalf_of_principal_id,on_behalf_of'
    )
    expect(csv).toContain('auth.signin.rate_limited')
    expect(csv).toContain(email)

    // A filter that matches nothing says so, rather than leaving a stale table.
    await filter.fill(`e2e-audit-nobody-${Date.now()}@example.test`)
    // The empty copy renders twice (desktop table + mobile cards); either is
    // the visible one at this viewport.
    await expect(page.getByText('No audit events match these filters yet.').first()).toBeVisible({
      timeout: 20_000,
    })
  })

  test('the retired audit-log route forwards to the Access & Security tab', async ({ page }) => {
    // The standalone route is kept as a permanent redirect so old bookmarks
    // and links keep working.
    await page.goto('/admin/settings/security/audit-log')
    await expect(page).toHaveURL(/tab=audit-log/, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('searchbox', { name: 'Filter audit events by actor email' })
    ).toBeVisible({ timeout: 15_000 })
  })
})
