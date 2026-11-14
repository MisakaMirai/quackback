/**
 * The AI allowance: which window `aiTokensPerMonth` is measured over, and
 * whether the workspace has used it up.
 *
 * The window is the UTC calendar month. An operator who caps AI sets
 * `aiTokensPerMonth` through the tier limits; no cap means unlimited.
 */
import { getTierLimits } from '@/lib/server/domains/settings/tier-limits.service'
import { aiTokensInWindow, utcMonthStart, utcNextMonthStart } from './usage-counter'

export interface AiBudgetWindow {
  kind: 'month'
  start: Date
  /** Exclusive. Also when a paused background job should look again. */
  end: Date
}

/** Pure: the allowance window in force at `now`. */
export function aiBudgetWindow(now: Date = new Date()): AiBudgetWindow {
  return { kind: 'month', start: utcMonthStart(now), end: utcNextMonthStart(now) }
}

export async function currentAiBudgetWindow(now: Date = new Date()): Promise<AiBudgetWindow> {
  return aiBudgetWindow(now)
}

/** Tokens used in the current allowance window. */
export async function aiTokensThisWindow(now: Date = new Date()): Promise<number> {
  const window = await currentAiBudgetWindow(now)
  return aiTokensInWindow(window.start, window.end)
}

export interface AiBudgetStatus {
  /** Null = unlimited. */
  cap: number | null
  used: number
  exhausted: boolean
  window: AiBudgetWindow
}

/**
 * The allowance as of now. An unlimited install never reads usage, so an
 * install without limits pays nothing for the check.
 */
export async function getAiBudgetStatus(now: Date = new Date()): Promise<AiBudgetStatus> {
  const limits = await getTierLimits()
  const cap = limits.aiTokensPerMonth
  const window = await currentAiBudgetWindow(now)
  if (cap === null) return { cap, used: 0, exhausted: false, window }
  const used = await aiTokensInWindow(window.start, window.end)
  return { cap, used, exhausted: used >= cap, window }
}
