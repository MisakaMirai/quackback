/**
 * The audience a Better Auth session is minted for, decided as the row is
 * created (`databaseHooks.session.create.before`).
 *
 * Kept out of `auth/index.ts` so the decision can be driven directly: an
 * inline hook body is reachable only by standing up a whole auth instance.
 */
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getClientIp } from '@/lib/server/domains/api/rate-limit'
import type { SessionScope } from '@/lib/shared/roles'

type HeaderBag = { get(name: string): string | null }

export interface SessionCreateContext {
  path?: string
  headers?: HeaderBag
  request?: { headers?: HeaderBag }
}

/**
 * The scope for a fresh anonymous session. There is one anonymous audience —
 * the portal — so an anonymous mint is always tagged for it, whichever client
 * asked for it.
 */
export function anonymousSessionScope(): SessionScope {
  return 'portal'
}

/**
 * Only the anonymous mint is tagged (with its scope and the caller's resolved
 * address); every other session-creating path is a sign-in and keeps the
 * column default (dashboard).
 */
export async function assignSessionScope<T extends Record<string, unknown>>(
  sessionData: T,
  context: SessionCreateContext | null | undefined
): Promise<{ data: T & { scope: SessionScope; ipAddress: string } } | undefined> {
  if (context?.path !== '/sign-in/anonymous') return undefined
  // The address through getClientIp, which honours only trusted proxy hops,
  // rather than the first forwarding header a client could set. The anonymous
  // vote limit counts these sessions by that address.
  return {
    data: {
      ...sessionData,
      scope: anonymousSessionScope(),
      ipAddress: getClientIp(getRequestHeaders()),
    },
  }
}
