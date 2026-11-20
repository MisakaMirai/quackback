import { createFileRoute } from '@tanstack/react-router'
import { serviceActorFromApiAuth } from '@/lib/server/domains/api/service-actor'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { handleDomainError } from '@/lib/server/domains/api/responses'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { appJsonResponse, preflightResponse } from '@/lib/server/integrations/apps/cors'

export const Route = createFileRoute('/api/v1/apps/search')({
  server: {
    handlers: {
      OPTIONS: () => preflightResponse(),

      GET: async ({ request }) => {
        try {
          const auth = await withApiKeyAuth(request, { permission: PERMISSIONS.POST_VIEW_PRIVATE })
          const url = new URL(request.url)
          const q = url.searchParams.get('q')?.trim()
          const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 20)

          if (!q) {
            return appJsonResponse({ posts: [] })
          }

          const { listPublicPosts } = await import('@/lib/server/domains/posts/post.public')

          // Build a service-principal Actor from the API-key auth so
          // listPublicPosts uses team-level postViewFilter. Without
          // this, the default ANONYMOUS_ACTOR makes a team caller see
          // only public-board posts — the wrong direction. Team
          // callers (admin | member) short-circuit on isTeamActor, so
          // segmentIds don't matter; pass an empty set.
          const actor = serviceActorFromApiAuth(auth)
          const result = await listPublicPosts({
            search: q,
            sort: 'top',
            limit,
            page: 1,
            actor,
          })

          // The list row carries statusId only; resolve names/colors in one
          // query so the sidebar can render the status badge the OpenAPI
          // response promises.
          const { db, postStatuses, inArray } = await import('@/lib/server/db')
          const statusIds = [
            ...new Set(
              result.items
                .map((p) => p.statusId)
                .filter((id): id is NonNullable<typeof id> => id !== null)
            ),
          ]
          const statusRows =
            statusIds.length > 0
              ? await db
                  .select({
                    id: postStatuses.id,
                    name: postStatuses.name,
                    color: postStatuses.color,
                  })
                  .from(postStatuses)
                  .where(inArray(postStatuses.id, statusIds))
              : []
          const statusById = new Map(statusRows.map((s) => [s.id, s]))

          const posts = result.items.map((p) => {
            const status = p.statusId ? statusById.get(p.statusId) : undefined
            return {
              id: p.id,
              title: p.title,
              voteCount: p.voteCount,
              statusName: status?.name ?? null,
              statusColor: status?.color ?? null,
              board: p.board ? { name: p.board.name } : { name: '' },
            }
          })

          return appJsonResponse({ posts })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
