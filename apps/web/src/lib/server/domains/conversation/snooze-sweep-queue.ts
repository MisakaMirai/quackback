/**
 * Snooze-wake sweeper — a per-minute job that reopens snoozed conversations
 * whose wake timer has elapsed (see sweepDueSnoozedConversations), publishing
 * the same realtime/inbox updates a manual reopen does.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/server/db'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'
import { logger } from '@/lib/server/logger'
import { dueWithin, registerWorkspaceDeadline } from '@/lib/server/jobs/deadlines'
import { sweepDueSnoozedConversations } from './conversation.service'

const log = logger.child({ component: 'snooze-sweep' })

/** When this workspace's snooze tick next has anything to do. */
async function nextSnoozeTickAt(): Promise<Date | null> {
  const result = await db.execute(sql`
    SELECT min(snoozed_until) AS due_at
    FROM conversations
    WHERE status = 'snoozed' AND snoozed_until IS NOT NULL
  `)
  const rows = getExecuteRows<{ due_at: Date | string | null }>(result)
  const value = rows[0]?.due_at ?? null
  return value === null ? null : value instanceof Date ? value : new Date(value)
}

registerWorkspaceDeadline('snooze-sweep', nextSnoozeTickAt)

export function isSnoozeSweepDue(): Promise<boolean> {
  return dueWithin('snooze-sweep', 60_000)
}

export async function runSnoozeSweep(): Promise<void> {
  const result = await sweepDueSnoozedConversations()
  if (result.woken > 0) {
    log.debug({ woken: result.woken }, 'snooze-sweep run complete')
  }
}
