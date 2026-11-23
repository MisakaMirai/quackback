/**
 * A visitor's read changes the portal Support list's unread counts, so that
 * query refetches; queries unrelated to unread are left alone.
 */
import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { conversationKeys } from '@/lib/client/queries/conversation-keys'
import { refreshVisitorUnreadCounts } from '../visitor-read'

function seed(client: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const key of keys) client.setQueryData(key, { seeded: true })
}

describe('refreshVisitorUnreadCounts', () => {
  it('invalidates the portal conversation list and nothing unrelated', () => {
    const queryClient = new QueryClient()
    const seeded = [conversationKeys.portalConversationList()] as const
    const unrelated = [['widget'], ['changelog']] as const
    seed(queryClient, [...seeded, ...unrelated])

    refreshVisitorUnreadCounts(queryClient)

    for (const key of seeded) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
    for (const key of unrelated) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    }
  })
})
