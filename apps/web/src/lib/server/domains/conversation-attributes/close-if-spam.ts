/**
 * Close-spam harvest: when Quinn classifies a conversation as spam (select
 * key `spam`, option label `Spam`) and the workspace setting is on, close
 * via a bounded service actor — the same close a workflow `close` action
 * uses, not the inbound spam-file primitive. A service-actor close is what
 * W3 already maps onto the escalated assistant-wait edge. Only call after
 * AI-sourced attribute writes land — teammate-authored flips must never
 * reach this function.
 */
import type { ConversationId } from '@quackback/ids'
import { logger } from '@/lib/server/logger'
import { boundedServiceActor } from '@/lib/server/policy/service-actor'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import { getWorkflowCloseSpamSettings } from '@/lib/server/domains/settings/settings.workflows'

const log = logger.child({ component: 'close-if-spam' })

/** Bounded authority for the automatic close: support actions only. */
const CLOSE_SPAM_PERMISSIONS: ReadonlySet<PermissionKey> = new Set([
  PERMISSIONS.CONVERSATION_VIEW,
  PERMISSIONS.CONVERSATION_VIEW_ALL,
  PERMISSIONS.CONVERSATION_REPLY,
  PERMISSIONS.CONVERSATION_SET_STATUS,
])

export function isSpamClassification(
  applied: ReadonlyArray<{ key: string; optionLabel: string }>
): boolean {
  return applied.some((a) => a.key === 'spam' && a.optionLabel === 'Spam')
}

export async function maybeCloseConversationIfSpamClassified(
  conversationId: ConversationId,
  applied: ReadonlyArray<{ key: string; optionLabel: string }>
): Promise<void> {
  if (!isSpamClassification(applied)) return
  const settings = await getWorkflowCloseSpamSettings()
  if (!settings.enabled) return

  try {
    const { setConversationStatus } =
      await import('@/lib/server/domains/conversation/conversation.service')
    await setConversationStatus(
      conversationId,
      'closed',
      boundedServiceActor(CLOSE_SPAM_PERMISSIONS)
    )
  } catch (err) {
    log.warn({ err, conversationId }, 'close-spam failed')
  }
}
