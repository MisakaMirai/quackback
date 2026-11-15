/**
 * One page of the admin feedback list, with the pending merge suggestion
 * count of each post on it: the duplicate badge its row shows. Counting with
 * the page saves the list a second request per page for its badges. A search
 * that matches no post on every word is widened first (withInboxSearchMode),
 * and the page says how.
 */
import { listInboxPosts } from './post.inbox'
import { withInboxSearchMode } from './post.inbox.search'

export async function listAdminInboxPage(
  params: Parameters<typeof listInboxPosts>[0],
  options?: { pendingDuplicates?: boolean }
) {
  const listParams = await withInboxSearchMode(params, options)
  const page = await listInboxPosts(listParams)
  return {
    ...page,
    ...(listParams.searchMode !== 'all' && { searchMode: listParams.searchMode }),
  }
}
