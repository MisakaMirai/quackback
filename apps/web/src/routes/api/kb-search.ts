import { createFileRoute } from '@tanstack/react-router'
import {
  isFeatureEnabled,
  getHelpCenterConfig,
} from '@/lib/server/domains/settings/settings.service'
import {
  hybridSearchForLocale,
  resolveSearchLocale,
} from '@/lib/server/domains/help-center/help-center-search.service'
import { getClientIp } from '@/lib/server/domains/api/rate-limit'
import { bucketRetryAfter, incrementBucket } from '@/lib/server/utils/rate-bucket'
import { getOptionalAuth, policyActorFromAuth } from '@/lib/server/functions/auth-helpers'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'kb-search' })

/** Generous per-IP allowance: typing in the search box fires many requests. */
export const KB_SEARCH_RATE_LIMIT = 60
const RATE_WINDOW_SECONDS = 60

function jsonError(status: number, code: string, message: string, extraHeaders = {}) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } }
  )
}

export async function handleKbSearch({ request }: { request: Request }): Promise<Response> {
  if (!(await isFeatureEnabled('helpCenter'))) {
    return jsonError(404, 'NOT_FOUND', 'Knowledge base not found')
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim()
  const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 20)

  if (!q) {
    return Response.json({ data: { articles: [] } }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const bucket = { key: `kbsearch:ip:${getClientIp(request)}`, windowSeconds: RATE_WINDOW_SECONDS }
  const { count } = await incrementBucket(bucket)
  if (count !== null && count > KB_SEARCH_RATE_LIMIT) {
    const retryAfter = await bucketRetryAfter(bucket)
    return jsonError(429, 'RATE_LIMITED', 'Too many searches, slow down', {
      'Retry-After': String(retryAfter),
    })
  }

  try {
    // The caller's UI locale rides along; an unrecognized or not-enabled locale
    // silently falls back to the default rather than searching an empty
    // translation table.
    const requestedLocale = url.searchParams.get('locale') ?? undefined
    const config = await getHelpCenterConfig()
    const locale = resolveSearchLocale(
      requestedLocale,
      config.locales.additional,
      config.locales.default
    )
    // Signed-in portal visitors see segment-gated categories they belong to;
    // anonymous callers resolve to the anonymous actor and only see ungated
    // content.
    const viewer = await policyActorFromAuth(await getOptionalAuth())
    const results = await hybridSearchForLocale(q, locale, limit, viewer)

    const articles = results.map((a) => ({
      id: a.id,
      urlId: a.urlId,
      slug: a.slug,
      title: a.title,
      content: a.content?.slice(0, 200) ?? '',
      category: { id: a.categoryId, slug: a.categorySlug, name: a.categoryName },
    }))

    return Response.json({ data: { articles } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    log.error({ err: error }, 'kb search failed')
    return jsonError(500, 'SERVER_ERROR', 'Search failed')
  }
}

export const Route = createFileRoute('/api/kb-search')({
  server: {
    handlers: {
      GET: handleKbSearch,
    },
  },
})
