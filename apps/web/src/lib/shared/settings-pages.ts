interface SettingsPageEntry {
  label: string
}

/**
 * The single registry of settings page labels. The settings nav, the module
 * lists and every page title read from here, so a nav label and the title of
 * the page it opens cannot differ. Keys are the page paths. It imports no
 * icons, so a label lookup does not pull the icon set into its chunk; the nav
 * takes icons from settings-page-icons.ts.
 */
export const SETTINGS_PAGES = {
  // Modules
  '/admin/settings/feedback': { label: 'Feedback & Roadmaps' },
  '/admin/settings/support': { label: 'Support' },
  // Feedback & Roadmaps
  '/admin/settings/boards': { label: 'Boards' },
  '/admin/settings/statuses': { label: 'Statuses' },
  '/admin/settings/tags': { label: 'Tags' },
  '/admin/settings/moderation': { label: 'Moderation' },
  // Support
  '/admin/settings/channels': { label: 'Channels' },
  '/admin/settings/channels/messenger': { label: 'Messenger' },
  '/admin/settings/channels/email': { label: 'Email' },
  '/admin/settings/channels/github': { label: 'GitHub' },
  '/admin/settings/macros': { label: 'Macros' },
  '/admin/settings/office-hours': { label: 'Office hours' },
  '/admin/settings/sla': { label: 'SLA policies' },
  '/admin/settings/ticket-types': { label: 'Ticket types' },
  '/admin/settings/ticket-statuses': { label: 'Ticket statuses' },
  // Other product modules
  '/admin/settings/help-center': { label: 'Help Center' },
  '/admin/settings/changelog': { label: 'Changelog' },
  '/admin/settings/status': { label: 'Status' },
  // Workspace
  '/admin/settings/general': { label: 'General' },
  '/admin/settings/domains': { label: 'Domains' },
  '/admin/settings/notifications': { label: 'Notifications' },
  '/admin/settings/portal': { label: 'Portal' },
  '/admin/settings/widget': { label: 'Widget' },
  '/admin/settings/widget/install': { label: 'Install' },
  '/admin/settings/members': { label: 'Members & Teams' },
  '/admin/settings/security/authentication': { label: 'Access & Security' },
  '/admin/settings/developers': { label: 'Developers' },
  '/admin/settings/integrations': { label: 'Integrations' },
  // Data
  '/admin/settings/people': { label: 'Users' },
  '/admin/settings/conversation-data': { label: 'Conversations' },
  '/admin/settings/imports': { label: 'Imports & exports' },
} as const satisfies Record<string, SettingsPageEntry>

export type SettingsPagePath = keyof typeof SETTINGS_PAGES

export function settingsPageLabel(path: SettingsPagePath): string {
  const page = SETTINGS_PAGES[path]
  if (!page) throw new Error(`No settings page registered for ${path}`)
  return page.label
}
