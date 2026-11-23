/**
 * The admin feedback list's search mode, settled once per request (see
 * post.search), the same way the portal feed settles its own.
 */
import { db, and, sql, posts } from '@/lib/server/db'
import { inboxFilterConditions } from './post.inbox'
import { resolvePostSearchMode, type PostSearchMode } from './post.search'
import type { InboxPostListParams } from './post.types'

/**
 * Settles how loosely the request's search matches: every word, half of
 * them, or a close spelling.
 */
export async function withInboxSearchMode<T extends InboxPostListParams>(
  params: T,
  _options: { pendingDuplicates?: boolean } = {}
): Promise<T & { searchMode: PostSearchMode }> {
  const searchMode = await resolvePostSearchMode(params.search, async (mode) => {
    const conditions = inboxFilterConditions({ ...params, searchMode: mode })
    const rows = await db
      .select({ found: sql<number>`1` })
      .from(posts)
      .where(and(...conditions))
      .limit(1)
    return rows.length > 0
  })
  return { ...params, searchMode }
}
