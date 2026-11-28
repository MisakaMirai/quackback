/**
 * Per-post access assertions for write paths.
 *
 * Read paths already gate via `getPublicBoardById(boardId, actor)` and
 * `getPublicPostDetail(postId, actor)` — both apply `canViewBoard` /
 * `canViewPost` internally. Write paths (vote, comment, reaction, edit,
 * delete) used to gate only on portal-access + the actor's role, NOT on
 * whether the actor was entitled to view the target post under its
 * board's audience / moderation state. That let an authenticated portal
 * user mutate posts on team-only boards if they could guess an id.
 *
 * `assertPostViewable` is the chokepoint: every write handler that
 * accepts a post id must call this before any mutation. It throws a
 * NotFoundError-shaped error (don't leak existence to denied callers).
 */
import { db, eq, and, or, isNull, posts, boards, postComments } from '@/lib/server/db'
import { type PostCommentId, type PostId } from '@quackback/ids'
import { NotFoundError, ForbiddenError } from '@/lib/shared/errors'
import { notTestPrincipal } from '@/lib/server/test-data'
import { memoizePerRequest } from '@/lib/server/request-memo'
import {
  canViewPost,
  canVotePost,
  isTeamActor,
  postViewFilter,
  type Actor,
} from '@/lib/server/policy'

/**
 * The post/board row a view assertion reads. Shared by {@link assertPostViewable}
 * and {@link loadViewablePostContext}: the write chokepoint only needs the
 * allow/deny decision, while the portal post page's read endpoints also need
 * the context to gate a capability without a second read.
 */
async function loadPostViewRow(postId: PostId, actor: Actor) {
  // Fetch only the fields the policy needs. Soft-deleted post or board
  // is treated as "doesn't exist" — the join uses INNER + isNull
  // guards so any null falls into the null branch below.
  const rows = await db
    .select({
      moderationState: posts.moderationState,
      principalId: posts.principalId,
      access: boards.access,
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(
      and(
        eq(posts.id, postId),
        isNull(posts.deletedAt),
        isNull(boards.deletedAt),
        postViewFilter(actor)
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const decision = canViewPost(
    actor,
    {
      moderationState: row.moderationState,
      principalId: row.principalId,
    },
    { access: row.access }
  )
  return decision.allowed ? row : null
}

/** The post fields a view check resolves, for callers that also gate a capability. */
export type PostViewContext = NonNullable<Awaited<ReturnType<typeof loadPostViewRow>>>

/**
 * Actor identity for the request memo. A request has one actor, but the key
 * carries its identity anyway: tests and background callers share a process
 * without a request scope, where reuse across viewers would be wrong.
 */
function viewActorKey(actor: Actor): string {
  const segments = [...actor.segmentIds].sort().join(',')
  return `${actor.principalType}:${actor.principalId ?? '-'}:${actor.role ?? '-'}:${
    actor.scopePrincipalId ?? '-'
  }:${segments}`
}

/**
 * Resolve the post view decision, sharing one read across every caller in the
 * same request. The portal post page resolves the post through several server
 * functions (the detail, the comments section, the vote sidebar), and each used
 * to run its own audience read; the request memo turns those into one.
 */
export function loadViewablePostContext(
  postId: PostId,
  actor: Actor
): Promise<PostViewContext | null> {
  return memoizePerRequest(`post-view:${postId}:${viewActorKey(actor)}`, () =>
    loadPostViewRow(postId, actor)
  )
}

export async function assertPostViewable(postId: PostId, actor: Actor): Promise<void> {
  const context = await loadViewablePostContext(postId, actor)
  if (!context) {
    // 404-shape on deny so we don't leak existence to a denied caller.
    throw new NotFoundError('POST_NOT_FOUND', `Post ${postId} not found`)
  }
}

/**
 * Vote-write chokepoint. Composes:
 *  - `loadViewablePostContext` (audience + moderation + own-pending), 404 on deny.
 *  - `canVotePost` (board.access.vote tier), 403 on deny — the post is
 *    visible to the caller, so leaking existence isn't a concern; the
 *    "Sign in to vote on this board" / "Only specific groups…" hint is
 *    deliberately surfaced.
 *
 * The workspace `features.allowAnonymous` master switch is composed by
 * the caller — this chokepoint is the per-board policy gate only.
 */
export async function assertPostVotable(postId: PostId, actor: Actor): Promise<void> {
  const context = await loadViewablePostContext(postId, actor)
  if (!context) {
    // View denied (or the post vanished): 404-shape so existence doesn't leak.
    throw new NotFoundError('POST_NOT_FOUND', `Post ${postId} not found`)
  }

  const decision = canVotePost(
    actor,
    {
      moderationState: context.moderationState,
      principalId: context.principalId,
    },
    { access: context.access }
  )
  if (!decision.allowed) {
    // The view check above already passed, so this can only be the vote tier.
    throw new ForbiddenError('VOTE_NOT_ALLOWED', decision.reason)
  }
}

/**
 * Same chokepoint for comment-targeted mutations (userEditCommentFn /
 * userDeleteCommentFn / reaction toggles). Resolves the comment's post
 * + board in one query and:
 *
 *   1. 404s when comment / post / board is soft-deleted.
 *   2. Runs the actor through `canViewPost` (audience + moderation +
 *      own-pending).
 *   3. Refuses non-team actors on private comments.
 *
 * Throws NotFoundError on every deny path so the response shape is
 * uniform — denied callers can't probe existence by varying inputs.
 */
export async function assertCommentViewable(commentId: PostCommentId, actor: Actor): Promise<void> {
  const rows = await db
    .select({
      isPrivate: postComments.isPrivate,
      postModerationState: posts.moderationState,
      postPrincipalId: posts.principalId,
      access: boards.access,
    })
    .from(postComments)
    .innerJoin(posts, eq(postComments.postId, posts.id))
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(
      and(
        eq(postComments.id, commentId),
        isNull(postComments.deletedAt),
        isNull(posts.deletedAt),
        isNull(boards.deletedAt),
        postViewFilter(actor),
        isTeamActor(actor)
          ? undefined
          : actor.principalId
            ? or(
                notTestPrincipal(postComments.principalId),
                eq(postComments.principalId, actor.principalId)
              )
            : notTestPrincipal(postComments.principalId)
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new NotFoundError('COMMENT_NOT_FOUND', `Comment ${commentId} not found`)
  }

  const decision = canViewPost(
    actor,
    {
      moderationState: row.postModerationState,
      principalId: row.postPrincipalId,
    },
    { access: row.access }
  )
  if (!decision.allowed) {
    throw new NotFoundError('COMMENT_NOT_FOUND', `Comment ${commentId} not found`)
  }

  // Private comments are team-only. Non-team actors must not even know
  // the comment exists — same NotFoundError shape.
  if (row.isPrivate && !isTeamActor(actor)) {
    throw new NotFoundError('COMMENT_NOT_FOUND', `Comment ${commentId} not found`)
  }
}
