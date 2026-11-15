/** Quackback AI removal shim. */
export interface AiBudgetStatus {
  used: number
  cap: number | null
  exhausted: boolean
}

export async function getAiBudgetStatus(): Promise<AiBudgetStatus> {
  return { used: 0, cap: 0, exhausted: true }
}
