/**
 * The master secret in force right now.
 *
 * One accessor rather than a dozen `config.secretKey` reads, so every consumer
 * (session signing, token minting, stored ciphertext) uses the same key. A
 * single-instance install has exactly one: `SECRET_KEY`.
 */
import { config } from './config'

export function activeSecretKey(): string {
  return config.secretKey
}
