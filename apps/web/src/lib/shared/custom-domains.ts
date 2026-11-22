/**
 * The sections a custom domain can serve: the portal nav's own built-in tabs.
 * A self-hosted server's custom domain is its help center's, set on Help
 * center settings.
 */
import type { PortalNavItemType } from './types/settings'

/** A section of the portal: one of the nav's built-in tabs. */
export type PortalSection = Exclude<PortalNavItemType, 'link'>
