/** Quackback AI removal shim: inbox translation is unavailable. */
import type { ConversationId } from '@quackback/ids'

export class TranslationUnavailableError extends Error {}

export interface InboxTranslationContext {
  enabled: boolean
  customerLocale: string | null
}

export async function resolveOutgoingReplyTranslation(input: {
  conversationId: ConversationId
  content: string
  contentJson?: unknown
  teammateUserId?: string
}) {
  return {
    content: input.content,
    contentJson: input.contentJson,
    translatedFrom: undefined,
  }
}

export async function getInboxTranslationContext(
  _conversationId: ConversationId
): Promise<InboxTranslationContext | null> {
  return null
}

export async function translateIncomingMessage(
  message: { content: string },
  _targetLocale: string
) {
  return { content: message.content, sourceLocale: null }
}

export async function inboxTranslationOverAllowance(): Promise<boolean> {
  return false
}

export async function maybeDetectCustomerLanguage(_conversation: unknown): Promise<void> {}

export async function setInboxTranslationEnabled(
  _conversationId: ConversationId,
  _enabled: boolean,
  _actor: unknown
): Promise<void> {}

export async function dismissInboxTranslationSuggestion(
  _conversationId: ConversationId,
  _actor: unknown
): Promise<void> {}

export async function cleanupExpiredMessageTranslations(): Promise<void> {}
