import type { QueryClient } from '@tanstack/react-query'
import { conversationKeys } from '@/lib/client/queries/conversation-keys'

/**
 * Refetch every count a visitor's read of a conversation changes: the portal
 * Support list (whose rows also feed the portal header badge). A key with no
 * cached query is a no-op.
 */
export function refreshVisitorUnreadCounts(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: conversationKeys.portalConversationList() })
}
