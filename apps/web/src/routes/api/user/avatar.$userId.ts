import { createFileRoute } from '@tanstack/react-router'
import { isValidTypeId, type UserId } from '@quackback/ids'
import { logger } from '@/lib/server/logger'
import { internalRouteErrorResponse } from '@/lib/server/domains/api/responses'

const log = logger.child({ component: 'user-avatar' })

/** Small enough for an avatar, large enough for a provider's 512px rendition. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TIMEOUT_MS = 5_000

/**
 * Fetch an external avatar and serve the bytes from this origin.
 *
 * Redirecting to `user.image` would be an open redirect: the field is writable
 * through the REST API and comes from OAuth/SSO profile data, so a member could
 * point this trusted product URL at a phishing page. Proxying also enforces the
 * SSRF guard and keeps the response an image.
 */
async function proxyImage(url: string): Promise<Response | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  // Never proxy this route into itself (a stored self-reference would recurse).
  if (parsed.pathname.startsWith('/api/user/avatar/')) return null

  try {
    // Imported here, like the handler's other server modules, so the SSRF
    // guard's Node http client never reaches the client bundle.
    const { safeFetch } = await import('@/lib/server/content/ssrf-guard')
    const upstream = await safeFetch(parsed.href, {
      timeoutMs: AVATAR_TIMEOUT_MS,
      maxResponseBytes: AVATAR_MAX_BYTES,
      onOverflow: 'error',
    })
    if (!upstream.ok) return null

    // SVG can carry script; serve only raster image types.
    const contentType = (upstream.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') return null

    const body = await upstream.arrayBuffer()
    return new Response(body, {
      headers: {
        'content-type': contentType,
        'content-length': String(body.byteLength),
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    // A refused/oversized/slow upstream is "no avatar", not a 500.
    return null
  }
}

export const Route = createFileRoute('/api/user/avatar/$userId')({
  server: {
    handlers: {
      /**
       * GET /api/user/avatar/[userId]
       * Serve the user's avatar: an S3 object (redirect to its public URL) or an
       * external OAuth image (proxied, never redirected to).
       */
      GET: async ({ params }) => {
        const { db, user, eq } = await import('@/lib/server/db')
        const { getPublicUrlOrNull } = await import('@/lib/server/storage/s3')

        try {
          const userIdParam = params.userId

          // Validate TypeID format
          if (!isValidTypeId(userIdParam, 'user')) {
            return Response.json({ error: 'Invalid user ID format' }, { status: 400 })
          }
          const userId = userIdParam as UserId

          const userRecord = await db.query.user.findFirst({
            where: eq(user.id, userId),
            columns: {
              imageKey: true,
              image: true,
            },
          })

          if (!userRecord) {
            return Response.json({ error: 'User not found' }, { status: 404 })
          }

          // If user has an S3 avatar, redirect to it (this takes priority)
          if (userRecord.imageKey) {
            const s3Url = getPublicUrlOrNull(userRecord.imageKey)
            if (s3Url) {
              return Response.redirect(s3Url)
            }
          }

          // External (OAuth) image: proxy it so this route can never redirect
          // off-origin.
          if (userRecord.image) {
            const proxied = await proxyImage(userRecord.image)
            if (proxied) return proxied
          }

          // No avatar available
          return Response.json({ error: 'No avatar found' }, { status: 404 })
        } catch (error) {
          log.error({ err: error }, 'avatar fetch failed')
          return internalRouteErrorResponse()
        }
      },
    },
  },
})
