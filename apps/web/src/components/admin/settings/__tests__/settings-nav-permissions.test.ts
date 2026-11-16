/**
 * Each workspace and data page in the settings nav checks a permission when
 * it opens. The nav offers a page only to a viewer who holds it, so a role
 * that may see the members list is not shown General, Portal or
 * Developers only to land on Access denied.
 */
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import {
  buildNavSections,
  canOpenSettings,
  firstSettingsPath,
  navSectionsFor,
} from '../settings-nav-sections'

type Sections = ReturnType<typeof buildNavSections>

const labels = (sections: Sections, section: string) =>
  sections.find((s) => s.label === section)?.items.map((item) => item.label) ?? null

describe('navSectionsFor', () => {
  it('shows a member.view role only the workspace pages it can open', () => {
    const sections = navSectionsFor(
      buildNavSections({}),
      new Set<PermissionKey>([PERMISSIONS.MEMBER_VIEW])
    )

    expect(labels(sections, 'Workspace')).toEqual(['Notifications', 'Members & Teams'])
    // No data page is open to it, so the section goes.
    expect(labels(sections, 'Data')).toBeNull()
  })

  it('gates each page on the permission it checks', () => {
    const only = (permission: PermissionKey) =>
      navSectionsFor(buildNavSections({ supportInbox: true }), new Set([permission]))

    expect(labels(only(PERMISSIONS.SETTINGS_MANAGE), 'Workspace')).toEqual([
      'General',
      'Domains',
      'Email',
      'Notifications',
    ])
    expect(labels(only(PERMISSIONS.SETTINGS_MANAGE), 'Data')).toEqual(['Imports & exports'])
    expect(labels(only(PERMISSIONS.SETTINGS_BRANDING), 'Workspace')).toEqual([
      'Notifications',
      'Portal',
    ])
    expect(labels(only(PERMISSIONS.SETTINGS_CUSTOM_DOMAIN), 'Workspace')).toEqual([
      'Domains',
      'Notifications',
    ])
    expect(labels(only(PERMISSIONS.AUTH_MANAGE), 'Workspace')).toEqual([
      'Domains',
      'Notifications',
      'Access & Security',
    ])
    expect(labels(only(PERMISSIONS.API_KEY_MANAGE), 'Workspace')).toEqual([
      'Notifications',
      'Developers',
    ])
    expect(labels(only(PERMISSIONS.INTEGRATION_VIEW), 'Workspace')).toEqual([
      'Notifications',
      'Integrations',
    ])
    expect(labels(only(PERMISSIONS.USER_ATTRIBUTE_VIEW), 'Data')).toEqual(['Users'])
    expect(labels(only(PERMISSIONS.CONVERSATION_MANAGE), 'Data')).toEqual(['Conversations'])
  })

  it('shows an owner every page', () => {
    const sections = buildNavSections({ supportInbox: true })
    expect(navSectionsFor(sections, new Set(SYSTEM_ROLE_PERMISSIONS.owner))).toEqual(sections)
  })

  it('shows an admin every workspace page', () => {
    const sections = navSectionsFor(buildNavSections({}), new Set(SYSTEM_ROLE_PERMISSIONS.admin))
    expect(labels(sections, 'Workspace')).toContain('General')
  })

  it('shows a module only the pages the viewer can open', () => {
    const flags = { supportInbox: true, supportTickets: true }
    const sections = navSectionsFor(
      buildNavSections(flags),
      new Set<PermissionKey>([PERMISSIONS.OFFICE_HOURS_MANAGE])
    )
    const modules = sections.find((s) => s.label === 'Modules')!.items
    expect(modules).toHaveLength(1)
    const support = modules[0] as unknown as { label: string; pages: { to: string }[] }
    expect(support.pages.map((k) => k.to)).toEqual(['/admin/settings/office-hours'])
  })

  it('drops a module with no openable pages', () => {
    const sections = navSectionsFor(
      buildNavSections({ supportInbox: true }),
      new Set<PermissionKey>([PERMISSIONS.MEMBER_VIEW])
    )
    expect(labels(sections, 'Modules')).toBeNull()
  })
})

describe('canOpenSettings', () => {
  const sections = buildNavSections({ supportInbox: true })
  const can = (...permissions: PermissionKey[]) => canOpenSettings(sections, new Set(permissions))

  it('is true for a holder of any page permission, however small', () => {
    expect(can(PERMISSIONS.MEMBER_VIEW)).toBe(true)
    expect(can(PERMISSIONS.USER_ATTRIBUTE_VIEW)).toBe(true)
  })

  it('is false when nothing but the personal Notifications page is open', () => {
    expect(can()).toBe(false)
    expect(can(PERMISSIONS.POST_CREATE)).toBe(false)
  })
})

describe('firstSettingsPath', () => {
  const preset = (role: 'owner' | 'manager' | 'contributor') =>
    new Set<PermissionKey>(SYSTEM_ROLE_PERMISSIONS[role])
  const flags = { supportInbox: true }
  const sections = buildNavSections(flags)
  const first = (permissions: Set<PermissionKey>, s = sections) => firstSettingsPath(s, permissions)

  it('opens General for a viewer who holds settings.manage', () => {
    expect(first(preset('owner'))).toBe('/admin/settings/general')
  })

  it('opens a page the Manager preset can open, not General', () => {
    const manager = preset('manager')
    expect(manager.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false)
    const path = first(manager)
    expect(path).not.toBe('/admin/settings/general')
    expect(path).not.toBe('/admin/settings/notifications')
    expect(canOpenSettings(sections, manager)).toBe(true)
  })

  it('opens a page the Contributor preset can open', () => {
    const contributor = preset('contributor')
    expect(first(contributor)).toBe('/admin/settings/members')
  })

  it('never lands on the Domains overview; a domain owner opens their own page', () => {
    expect(first(new Set([PERMISSIONS.AUTH_MANAGE]))).toBe(
      '/admin/settings/security/authentication'
    )
    // With the inbox on, the email page is under Channels, which needs more.
    expect(first(new Set([PERMISSIONS.CHANNEL_ACCOUNT_MANAGE]))).toBe(
      '/admin/settings/notifications'
    )
    const email = buildNavSections({ supportTickets: true })
    expect(first(new Set([PERMISSIONS.CHANNEL_ACCOUNT_MANAGE]), email)).toBe(
      '/admin/settings/channels/email'
    )
    // Domains holds web address setup, which this permission owns: it lands there.
    expect(first(new Set([PERMISSIONS.SETTINGS_CUSTOM_DOMAIN]))).toBe('/admin/settings/domains')
    // A viewer who only reaches Domains through another page's permission does not.
    expect(first(new Set([PERMISSIONS.AUTH_MANAGE]))).not.toBe('/admin/settings/domains')
  })

  it('opens Notifications for a viewer with no settings permission', () => {
    expect(first(new Set())).toBe('/admin/settings/notifications')
    expect(first(new Set([PERMISSIONS.TICKET_VIEW]), buildNavSections({}))).toBe(
      '/admin/settings/notifications'
    )
  })
})
