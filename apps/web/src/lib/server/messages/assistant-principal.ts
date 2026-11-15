import type { PrincipalId } from '@quackback/ids'

/**
 * Quackback AI is removed. There is no assistant service principal, so no
 * message is ever flagged as assistant-authored.
 */
export async function assistantPrincipalIdOnce(): Promise<PrincipalId | null> {
  return null
}
