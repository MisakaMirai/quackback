import type { ElementType } from 'react'
import type { MessageDescriptor } from 'react-intl'
import { ChartBarIcon, UsersIcon, GlobeAltIcon } from '@heroicons/react/24/solid'
import { ENTITY_ICONS } from '@/components/admin/entity-icon'

export type Section = 'overview' | 'visitors' | 'feedback' | 'support' | 'changelog' | 'users'

export interface SectionNavItem {
  key: Section
  label: MessageDescriptor
  icon: ElementType
}

export const SECTION_NAV_ITEMS: SectionNavItem[] = [
  {
    key: 'overview',
    label: { id: 'admin.analytics.nav.overview', defaultMessage: 'Overview' },
    icon: ChartBarIcon,
  },
  {
    key: 'visitors',
    label: { id: 'admin.analytics.nav.visitors', defaultMessage: 'Visitors' },
    icon: GlobeAltIcon,
  },
  {
    key: 'feedback',
    label: { id: 'admin.nav.feedback', defaultMessage: 'Feedback' },
    icon: ENTITY_ICONS.post,
  },
  {
    key: 'support',
    label: { id: 'admin.nav.support', defaultMessage: 'Support' },
    icon: ENTITY_ICONS.conversation,
  },
  {
    key: 'changelog',
    label: { id: 'admin.nav.changelog', defaultMessage: 'Changelog' },
    icon: ENTITY_ICONS.changelog,
  },
  {
    key: 'users',
    label: { id: 'admin.nav.users', defaultMessage: 'Users' },
    icon: UsersIcon,
  },
]

/** The section a `?section=` value names; anything unknown opens the overview. */
export function parseSection(value: unknown): Section {
  return SECTION_NAV_ITEMS.find((i) => i.key === value)?.key ?? 'overview'
}

/** The section a `?section=` value names, or undefined when it names none. */
export function sectionSearchValue(value: unknown): Section | undefined {
  return SECTION_NAV_ITEMS.find((i) => i.key === value)?.key
}
