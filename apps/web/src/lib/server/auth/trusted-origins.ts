/**
 * Origins Better Auth will accept for CSRF / Origin checks.
 *
 * One install has one canonical origin, `BASE_URL`. Anything else the operator
 * serves the app on — a custom portal or help-center hostname, a reverse proxy
 * that rewrites the host — is listed in `TRUSTED_ORIGINS`. The callback is
 * invoked per request rather than snapshotted when the auth instance is built,
 * so a changed environment reaches it without a rebuild.
 */
import { config } from '@/lib/server/config'

const WILDCARD_HOST_RE = /[*?]/

/** The origins of `baseUrl` plus one per hostname, all under its protocol. */
export function originsForHostnames(baseUrl: string, hostnames: readonly string[] = []): string[] {
  let protocol = 'https:'
  let baseOrigin: string | null = null
  try {
    const parsed = new URL(baseUrl)
    protocol = parsed.protocol
    baseOrigin = parsed.origin
  } catch {
    baseOrigin = null
  }
  const origins = new Set<string>()
  if (baseOrigin) origins.add(baseOrigin)
  for (const raw of hostnames) {
    const host = raw.trim().toLowerCase().split(':')[0] ?? ''
    if (!host || host.includes('/') || WILDCARD_HOST_RE.test(host)) continue
    origins.add(`${protocol}//${host}`)
  }
  return [...origins]
}

/** Better Auth's `trustedOrigins` callback. Each entry is a full origin. */
export function trustedAuthOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...originsForHostnames(config.baseUrl), ...extra]
}
