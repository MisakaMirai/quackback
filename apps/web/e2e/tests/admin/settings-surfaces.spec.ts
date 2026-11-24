import { test, expect, type Page } from '@playwright/test'
import { AUTH_STATE_PATH } from '../../utils/auth-state'
import { restoreSeedSurfaces, setSupportSurfaces } from '../../utils/db-helpers'

/**
 * Settings-surface smoke net: every settings page that no other spec visits
 * still has to render its own heading — and the legacy paths that were merged
 * into a canonical page still have to forward.
 *
 * Several specs drive individual settings pages (general, branding, boards,
 * tags, statuses, members, roles, permissions, api keys, webhooks, user
 * attributes, MCP, imports). The rest — support/ticket configuration, portal,
 * email, channels, notifications, moderation, content pages, the users
 * attribute page and the Access & Security page — had no visit at all, so a
 * runtime crash on one of them would ship unnoticed.
 *
 * The list below is the routes that exist today. The older table named pages
 * that no longer exist (`/admin/settings/domains` has no route file; its
 * headings are held by Portal, Help Center and the Users page) and pages that
 * are titled with their module rather than their own page name, which is why
 * Board/Statuses/Tags/Moderation all answer "Feedback & Roadmaps".
 *
 * Support, Help Center and Status are off on a fresh seed and their routes
 * redirect to General while they are off. The suite switches those products on
 * before visiting their pages, exactly as help-center.spec.ts does, so the
 * module surfaces are covered without depending on what an earlier spec left
 * switched on — and puts them back afterwards, so later specs get the seeded
 * workspace rather than one with three modules on.
 */

interface SettingsPageCase {
  path: string
  /** The page's `h1`, server-rendered: a page that throws shows its error boundary instead. */
  heading: string
  /** For a page of a module: the module tab that must be the current one. */
  tab?: string
}

/** Settings pages that render on a fresh workspace, with the heading they answer. */
const WORKSPACE_PAGES: readonly SettingsPageCase[] = [
  { path: '/admin/settings/general', heading: 'General' },
  { path: '/admin/settings/portal', heading: 'Portal' },
  { path: '/admin/settings/email', heading: 'Email' },
  { path: '/admin/settings/notifications', heading: 'Notifications' },
  { path: '/admin/settings/members', heading: 'Members & Teams' },
  { path: '/admin/settings/security/authentication?tab=audit-log', heading: 'Access & Security' },
  { path: '/admin/settings/developers', heading: 'Developers' },
  { path: '/admin/settings/integrations', heading: 'Integrations' },
  { path: '/admin/settings/people', heading: 'Users' },
  { path: '/admin/settings/imports', heading: 'Imports & exports' },
  { path: '/admin/settings/changelog', heading: 'Changelog' },
  // A module page is titled with its module and shows the module's pages as tabs.
  { path: '/admin/settings/boards', heading: 'Feedback & Roadmaps', tab: 'Boards' },
  { path: '/admin/settings/statuses', heading: 'Feedback & Roadmaps', tab: 'Statuses' },
  { path: '/admin/settings/tags', heading: 'Feedback & Roadmaps', tab: 'Tags' },
  { path: '/admin/settings/moderation', heading: 'Feedback & Roadmaps', tab: 'Moderation' },
]

/** Pages behind a product module, switched on in `beforeAll` before they are visited. */
const MODULE_PAGES: readonly SettingsPageCase[] = [
  { path: '/admin/settings/channels', heading: 'Support', tab: 'Channels' },
  { path: '/admin/settings/macros', heading: 'Support', tab: 'Macros' },
  { path: '/admin/settings/office-hours', heading: 'Support', tab: 'Office hours' },
  { path: '/admin/settings/sla', heading: 'Support', tab: 'SLA policies' },
  { path: '/admin/settings/ticket-types', heading: 'Support', tab: 'Ticket types' },
  { path: '/admin/settings/ticket-statuses', heading: 'Support', tab: 'Ticket statuses' },
  // Child pages of a channel: they carry a breadcrumb and their own title.
  { path: '/admin/settings/channels/messenger', heading: 'Messenger' },
  { path: '/admin/settings/channels/email', heading: 'Email' },
  { path: '/admin/settings/channels/github', heading: 'GitHub' },
  { path: '/admin/settings/conversation-data', heading: 'Conversations' },
  { path: '/admin/settings/help-center', heading: 'Help Center' },
  { path: '/admin/settings/status', heading: 'Status' },
]

/** The product switch (Settings > General) each module page above needs. */
/**
 * Product modules whose switch is a single Settings > General row. Support is
 * not one of them: its pages gate on the finer `supportTickets` flag, which the
 * suite's own fixture (`setSupportSurfaces`) sets together with `supportInbox`.
 */
const MODULE_SWITCHES = ['Help Center', 'Status'] as const

/** Pages that were folded into another one; the old URLs must still forward. */
const LEGACY_REDIRECTS = [
  { from: '/admin/settings', to: /\/admin\/settings\/general$/, heading: 'General' },
  { from: '/admin/settings/branding', to: /\/admin\/settings\/portal$/, heading: 'Portal' },
  {
    from: '/admin/settings/feedback',
    to: /\/admin\/settings\/boards$/,
    heading: 'Feedback & Roadmaps',
  },
  { from: '/admin/settings/support', to: /\/admin\/settings\/channels$/, heading: 'Support' },
  {
    from: '/admin/settings/conversations',
    to: /\/admin\/settings\/channels\/messenger$/,
    heading: 'Messenger',
  },
  {
    from: '/admin/settings/teams',
    to: /\/admin\/settings\/members\?tab=teams$/,
    heading: 'Members & Teams',
  },
  { from: '/admin/settings/team', to: /\/admin\/settings\/members$/, heading: 'Members & Teams' },
  {
    from: '/admin/settings/mcp',
    to: /\/admin\/settings\/developers\?tab=mcp$/,
    heading: 'Developers',
  },
  {
    from: '/admin/settings/security/audit-log',
    to: /\/admin\/settings\/security\/authentication\?tab=audit-log$/,
    heading: 'Access & Security',
  },
  {
    from: '/admin/settings/security/sso',
    to: /\/admin\/settings\/security\/authentication\?tab=sign-in$/,
    heading: 'Access & Security',
  },
] as const

/**
 * Switch a workspace product on from Settings > General, and only return once
 * the change is saved: a reload re-reads the flags, so the module's routes gate
 * on it after this returns. The switch updates optimistically, so a click that
 * lands before hydration looks applied but is never saved — the reload check
 * catches that and clicks again.
 */
async function enableProduct(page: Page, label: string): Promise<void> {
  await expect(async () => {
    await page.goto('/admin/settings/general')
    const toggle = page.getByRole('switch', { name: label })
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    if (await toggle.isChecked()) return
    await toggle.click()
    await expect(toggle).toBeChecked({ timeout: 5_000 })
    await page.goto('/admin/settings/general')
    await expect(page.getByRole('switch', { name: label })).toBeChecked({ timeout: 5_000 })
  }).toPass({ timeout: 45_000 })
}

/**
 * Wait until the running server serves the module pages the fixture just
 * enabled.
 *
 * `setSupportSurfaces` writes `settings.feature_flags` as raw SQL, and the server
 * keeps its settings copy for a few seconds (SETTINGS_LOCAL_TTL_MS), so a page
 * loaded right after the write can still see the module off and be redirected to
 * General. Reload until the page the flag gates on actually renders.
 */
async function waitForSupportModule(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto('/admin/settings/ticket-types')
    await expect(page).toHaveURL(/\/admin\/settings\/ticket-types/, { timeout: 2_000 })
  }).toPass({ timeout: 45_000 })
}

test.describe('Settings surfaces', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: testInfo.project.use.baseURL,
    })
    try {
      const page = await context.newPage()
      setSupportSurfaces(true, true)
      await waitForSupportModule(page)
      for (const label of MODULE_SWITCHES) await enableProduct(page, label)
    } finally {
      await context.close()
    }
  })

  // Put the workspace back the way the seed left it. These flags are
  // workspace-wide, and a module left on changes what other specs see — with
  // Support on, the portal renders a second "Support" heading and the public
  // support spec's own assertion stops being unambiguous. The reset writes the
  // seeded values (feedback and changelog on; support, tickets, Help Center and
  // Status off), which the UI switches alone cannot do: they only know the
  // product rows.
  test.afterAll(() => {
    restoreSeedSurfaces()
  })

  for (const { path, heading, tab } of [...WORKSPACE_PAGES, ...MODULE_PAGES]) {
    test(`${path} renders its ${heading} page`, async ({ page }) => {
      await page.goto(path)
      // No networkidle: the admin shell keeps SSE streams open, so the network
      // never goes idle on a settings page.
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible({
        timeout: 15_000,
      })
      if (tab) {
        // A module page is titled with its module, so the tab bar is what says
        // which page of the module rendered.
        await expect(
          page
            .getByRole('navigation', { name: heading })
            .getByRole('link', { name: tab, exact: true })
        ).toHaveAttribute('aria-current', 'page')
      }
      await expect(page.getByRole('heading', { name: /something went wrong/i })).toHaveCount(0)
    })
  }

  for (const { from, to, heading } of LEGACY_REDIRECTS) {
    test(`${from} forwards to its canonical page`, async ({ page }) => {
      await page.goto(from)
      await expect(page).toHaveURL(to, { timeout: 15_000 })
      // The canonical page rendered, not just its URL.
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible({
        timeout: 15_000,
      })
    })
  }
})
