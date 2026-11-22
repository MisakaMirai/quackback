import { settings } from '@/lib/server/db'
import type { SeatExecutor } from './seat-usage'

/**
 * Lock the settings row on `executor` so concurrent seat-taking writes
 * serialize on it and each counts the others' committed seats. Team additions
 * take it so their pending-invite and teammate re-checks are serialized too.
 */
export async function lockSeatLedger(executor: SeatExecutor): Promise<void> {
  const [row] = await executor.select({ id: settings.id }).from(settings).limit(1).for('update')
  if (!row) throw new Error('Workspace is not set up yet')
}
