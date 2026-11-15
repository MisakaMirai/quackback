/**
 * visitorConversationLink: the one place that decides where a conversation
 * email deep-links to — the portal Support thread.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationId } from '@quackback/ids'
import { visitorConversationLink } from '../conversation.notify'

const id = 'conversation_abc123' as ConversationId

describe('visitorConversationLink', () => {
  it('links to the portal Support thread', () => {
    expect(visitorConversationLink('https://feedback.example.com', id)).toBe(
      'https://feedback.example.com/support/conversation_abc123'
    )
  })

  it('tolerates a trailing slash on the base URL', () => {
    expect(visitorConversationLink('https://feedback.example.com/', id)).toBe(
      'https://feedback.example.com/support/conversation_abc123'
    )
  })
})
