import type { QueryClient } from '@tanstack/react-query'
import { adminQueries } from '@/lib/client/queries/admin'
import {
  defaultUsersFilters,
  portalUsersInfiniteOptions,
  totalUserCountOptions,
} from '@/lib/client/hooks/use-users-queries'
import { userTagsQueryOptions } from '@/lib/client/hooks/use-user-tags'
import { portalInvitesQueryOptions } from '@/lib/client/queries/portal-invites'
import { warmQuery } from '@/lib/client/queries/warm-query'

/**
 * Warm what the people page reads on every load, for its route loader: the
 * unfiltered people list, the segment and tag filters, the attribute
 * definitions and the nav badge counts. Each is best-effort: a failed read is
 * left to the page's own query.
 */
export function warmUsersPage(queryClient: QueryClient, role: string) {
  return Promise.all([
    queryClient.ensureInfiniteQueryData(portalUsersInfiniteOptions(defaultUsersFilters)),
    queryClient.ensureQueryData(adminQueries.segments()),
    warmQuery(queryClient, totalUserCountOptions('users')),
    warmQuery(queryClient, totalUserCountOptions('leads')),
    warmQuery(queryClient, adminQueries.userAttributes()),
    warmQuery(queryClient, userTagsQueryOptions()),
    role === 'admin' ? warmQuery(queryClient, portalInvitesQueryOptions()) : undefined,
  ])
}
