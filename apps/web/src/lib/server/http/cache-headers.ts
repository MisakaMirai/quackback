/**
 * Cache headers for responses whose body depends on the request's authority.
 *
 * An origin server's cache keys on the full URI, but a CDN in front of it may
 * not. `Vary: Host` states that the body depends on the authority.
 */

/**
 * `Cache-Control` plus a `Vary` that includes `Host`.
 *
 * @param maxAge seconds
 * @param alsoVaryOn additional `Vary` values (`Accept-Encoding`, …)
 */
export function publicWorkspaceCacheHeaders(
  maxAge: number,
  ...alsoVaryOn: string[]
): { 'Cache-Control': string; Vary: string } {
  return {
    'Cache-Control': `public, max-age=${maxAge}`,
    Vary: ['Host', ...alsoVaryOn].join(', '),
  }
}
