/**
 * The return path a new sending domain is set up with when the operator
 * serves bounce records under a domain of its own (`EMAIL_RETURN_PATH_DOMAIN`).
 *
 * The provider needs an MX to its feedback host and an SPF TXT at the MAIL FROM
 * name. With the setting, the operator publishes both once, as wildcards under
 * its own domain, and the customer's MAIL FROM name becomes one CNAME to
 * `<install label>.<operator domain>`; the provider follows the CNAME and
 * finds both. Unset, the customer publishes the MX and the TXT themselves.
 *
 * The label is per install, so an operator running several installs under one
 * return-path domain can tell their bounces apart and route them on their own
 * later. It is derived from `QUACKBACK_INSTANCE_ID`, never from a name a
 * customer chose: `ws-` and the first 24 hex characters of a SHA-256 of the
 * key. A key never changes, so neither does the label, and records published
 * under it keep resolving.
 */
import { createHash } from 'node:crypto'
import { sesReturnPathDomain } from '@quackback/email/ses-identity'

type EnvLike = Record<string, string | undefined>

/** The label used when the operator has not named the install. */
const UNNAMED_INSTALL_KEY = '__single__'

/** The DNS label for an install key: lowercase hex under a fixed prefix, 27 characters. */
export function returnPathLabel(installKey: string): string {
  const digest = createHash('sha256')
    .update(`quackback-workspace-identity-v1:${installKey}`)
    .digest('hex')
  return `ws-${digest.slice(0, 24)}`
}

/** The key this install is known by: its instance id, or a fixed marker. */
function installKey(env: EnvLike): string {
  return env.QUACKBACK_INSTANCE_ID?.trim() || UNNAMED_INSTALL_KEY
}

/** The label this install publishes its return path under. */
export function currentInstallLabel(env: EnvLike = process.env): string {
  return returnPathLabel(installKey(env))
}

/**
 * The CNAME target for a new domain's return path, or null when the domain
 * publishes the MX and TXT itself.
 */
export function returnPathTarget(env: EnvLike = process.env): string | null {
  const domain = sesReturnPathDomain(env)
  if (!domain) return null
  return `${currentInstallLabel(env)}.${domain}`
}
