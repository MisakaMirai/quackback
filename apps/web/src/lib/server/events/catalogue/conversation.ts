/**
 * Conversation-family event declarations (WO-2).
 */
import { decl } from './helpers'

const S = 'conversation'
const wh = { webhook: true } as const

export const conversationCreated = decl('conversation.created', 'conversation', wh, S)
export const conversationStatusChanged = decl('conversation.status_changed', 'conversation', wh, S)
export const conversationAssigned = decl('conversation.assigned', 'conversation', wh, S)
export const conversationPriorityChanged = decl(
  'conversation.priority_changed',
  'conversation',
  wh,
  S
)
export const conversationAttributeChanged = decl(
  'conversation.attribute_changed',
  'conversation',
  wh,
  S
)
export const conversationCsatSubmitted = decl('conversation.csat_submitted', 'conversation', wh, S)
export const conversationCsatCommentAdded = decl(
  'conversation.csat_comment_added',
  'conversation',
  { webhook: true },
  S
)
export const conversationNoteMentioned = decl(
  'conversation.note_mentioned',
  'conversation',
  { webhook: true, notification: 'mention' },
  S
)
