/**
 * The host this request was addressed to.
 *
 * One process serves one workspace, so the Host header is the install's own
 * origin. Same-origin checks compare a browser-set Origin against it.
 */
export function requestWorkspaceHost(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-host')
  const host = request.headers.get('host') ?? forwarded
  if (host) return host.trim() || null
  try {
    return new URL(request.url).host || null
  } catch {
    return null
  }
}

/** A bare hostname: lower-cased, without port. */
export function hostnameOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const host = value.trim().toLowerCase()
  if (!host) return null
  const withoutPort = host.replace(/:\d+$/, '')
  return withoutPort || null
}
