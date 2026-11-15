/** Quackback AI removal shim. */
export const ASSUMED_RESOLUTION_INACTIVITY_MINUTES = 60

export function isAssistantConfigured(): boolean {
  return false
}

export async function finalizeStaleAssistantInvolvements() {
  return { resolved: 0 }
}
