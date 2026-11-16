/**
 * The master secret in force right now.
 *
 * One accessor rather than a dozen `config.secretKey` reads, so every consumer
 * (session signing, token minting, stored ciphertext) uses the same key. A
 * single-workspace install has exactly one: `SECRET_KEY`.
 *
 * A test fixture may open a workspace scope with its own key; production never
 * does. The fallback is the process key.
 */
import { config } from './config'
import { getWorkspaceSecretKey } from './workspaces/workspace-context'

export function activeSecretKey(): string {
  return getWorkspaceSecretKey() ?? config.secretKey
}
