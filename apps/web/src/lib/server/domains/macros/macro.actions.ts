/**
 * A macro is "a bundle of actions with no trigger". It applies the stored
 * actions directly through the conversation services, so macros keep working
 * without the workflow engine.
 *
 * `set_attribute` is accepted and stored but no-ops until a general
 * conversation custom-attribute setter exists.
 */
import type { ConversationId, PrincipalId, ConversationTagId, TeamId } from '@quackback/ids'
import type { MacroAction, MacroSnoozePreset } from '@/lib/server/db'
import type { Actor } from '@/lib/server/policy/types'
import { tomorrowAt } from '@/lib/shared/utils/date'
import { logger } from '@/lib/server/logger'
import {
  assignConversation,
  assignTeam,
  setConversationPriority,
  setConversationStatus,
  snoozeConversation,
} from '@/lib/server/domains/conversation/conversation.service'
import { attachTag } from '@/lib/server/domains/conversation/conversation-tag.service'

const log = logger.child({ component: 'macro-actions' })

/** Resolve a snooze preset to a wake time; `until_reply` defers with no timer. */
function snoozeUntil(preset: MacroSnoozePreset): Date | null {
  switch (preset) {
    case 'tomorrow':
      return tomorrowAt(9)
    case 'next_week': {
      const d = tomorrowAt(9)
      d.setDate(d.getDate() + 6)
      return d
    }
    case 'until_reply':
    default:
      return null
  }
}

/**
 * Run each action against the conversation. Returns the labels of the actions
 * that were actually applied (deferred/failed ones are excluded), so the caller
 * can tell the agent exactly what happened.
 */
export async function applyMacroActions(
  conversationId: ConversationId,
  actions: MacroAction[],
  actor: Actor
): Promise<string[]> {
  if (actions.length === 0) return []
  const applied: string[] = []
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'assign_agent': {
          await assignConversation(conversationId, action.principalId as PrincipalId, actor)
          applied.push('Assigned')
          break
        }
        case 'assign_team': {
          await assignTeam(conversationId, action.teamId as TeamId, actor)
          applied.push('Assigned to team')
          break
        }
        case 'add_tag': {
          await attachTag(conversationId, action.tagId as ConversationTagId)
          applied.push('Tagged')
          break
        }
        case 'set_priority': {
          await setConversationPriority(conversationId, action.priority, actor)
          applied.push(`Priority: ${action.priority}`)
          break
        }
        case 'snooze': {
          await snoozeConversation(conversationId, snoozeUntil(action.preset), actor)
          applied.push('Snoozed')
          break
        }
        case 'close': {
          await setConversationStatus(conversationId, 'closed', actor)
          applied.push('Closed')
          break
        }
        case 'set_attribute':
          // No general conversation attribute setter yet; accepted but inert.
          break
      }
    } catch (err) {
      log.error({ err, action: action.type, conversationId }, 'macro action failed')
    }
  }
  return applied
}
