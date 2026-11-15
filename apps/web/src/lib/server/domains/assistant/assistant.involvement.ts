/** Quackback AI removal shim: no involuntary/Quinn state is tracked anymore. */
import type { ConversationId } from '@quackback/ids'

export type AssistantInvolvementStatus =
  'active' | 'handed_off' | 'resolved_confirmed' | 'resolved_assumed' | 'abandoned'

export const AI_INBOX_BUCKETS = {
  resolved: [] as AssistantInvolvementStatus[],
  escalated: [] as AssistantInvolvementStatus[],
  pending: [] as AssistantInvolvementStatus[],
}

export async function getLatestInvolvement(_conversationId: ConversationId) {
  return null
}

export async function countAssistantInboxBuckets() {
  return { resolved: 0, escalated: 0, pending: 0 }
}

export async function confirmResolutionFromCsat(
  _conversationId: ConversationId,
  _rating: number,
  _submittedAt: Date
): Promise<void> {}

export async function finalizeStaleAssistantInvolvements() {
  return { resolved: 0 }
}

export async function attributeCsatIfLastHandler(
  _conversationId: ConversationId,
  _rating: number
): Promise<void> {}
