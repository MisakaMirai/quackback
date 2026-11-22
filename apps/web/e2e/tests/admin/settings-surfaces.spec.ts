import { test, expect } from '@playwright/test'

/**
 * Settings-surface smoke net: every settings page that no other spec visits
 * still has to render its own heading — and the legacy paths that were merged
 * into a canonical page still have to forward.
 *
 * Several specs drive individual settings pages (general, branding, boards,
 * tags, statuses, members, roles, permissions, api keys, webhooks, user
 * attributes, MCP, imports). The rest — support/ticket configuration, portal,
 * domains, email, channels, notifications, moderation, content pages, the users
 * attribute page and the Access & Security page — had no visit at all, so a
 * runtime crash on one of them would ship unnoticed.
 */
const SETTINGS_PAGES = [
  { path: '/admin/settings/portal', heading: 'Portal' },
  { path: '/admin/settings/domains', heading: 'Domains' },
  { path: '/admin/settings/email', heading: 'Email' },
  { path: '/admin/settings/channels', heading: 'Support' },
  { path: '/admin/settings/ticket-types', heading: 'Support' },
  { path: '/admin/settings/ticket-statuses', heading: 'Support' },
  { path: '/admin/settings/sla', heading: 'Support' },
  { path: '/admin/settings/office-hours', heading: 'Support' },
  { path: '/admin/settings/macros', heading: 'Support' },
  { path: '/admin/settings/notifications', heading: 'Notifications' },
  { path: '/admin/settings/moderation', heading: 'Feedback & Roadmaps' },
  { path: '/admin/settings/help-center', heading: 'Help Center' },
  { path: '/admin/settings/changelog', heading: 'Changelog' },
  { path: '/admin/settings/status', heading: 'Status' },
  { path: '/admin/settings/people', heading: 'Users' },
  {
    path: '/admin/settings/security/authentication?tab=audit-log',
    heading: 'Access & Security',
  },
] as const

/** Pages that were folded into another one; the old URLs must still forward. */
const SETTINGS_REDIRECTS = [
  { from: '/admin/settings', to: /\/admin\/settings\/general$/ },
  { from: '/admin/settings/branding', to: /\/admin\/settings\/portal$/ },
  { from: '/admin/settings/feedback', to: /\/admin\/settings\/boards$/ },
  { from: '/admin/settings/conversations', to: /\/admin\/settings\/channels\/messenger$/ },
  { from: '/admin/settings/support', to: /\/admin\/settings\/channels$/ },
  { from: '/admin/settings/teams', to: /\/admin\/settings\/members\?tab=teams$/ },
  { from: '/admin/settings/mcp', to: /\/admin\/settings\/developers\?tab=mcp$/ },
] as const

test.describe('Settings surfaces', () => {
  for (const { path, heading } of SETTINGS_PAGES) {
    test(`${path} renders its ${heading} page`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // The module heading (Workspace / Support / …) sits above the page title;
      // both render server-side, so a page that throws shows its error
      // boundary instead and no heading matches.
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('heading', { name: /something went wrong/i })).toHaveCount(0)
    })
  }

  for (const { from, to } of SETTINGS_REDIRECTS) {
    test(`${from} forwards to its canonical page`, async ({ page }) => {
      await page.goto(from)
      await expect(page).toHaveURL(to, { timeout: 15_000 })
      await page.waitForLoadState('networkidle')
      await expect(
        page.getByRole('heading', { name: 'Settings', exact: true }).first()
      ).toBeVisible({ timeout: 15_000 })
    })
  }
})
