/**
 * Whether this workspace controls a single sign-on domain: the domain's own
 * verification TXT is the only evidence, since a self-hosted install has no
 * cross-domain proof to inherit.
 */
import { lookupVerificationTxt } from '@/lib/server/auth/dns-verify'
import { interactiveResolver } from '@/lib/server/dns/resolver'
import { SSO_VERIFY_RECORD_HOST, ssoVerifyRecordValue } from '@/lib/shared/sso-domain'

export type SsoDomainCheck =
  { ok: true; via: 'dns' } | { ok: false; reason: 'no-record' | 'lookup-failed' | 'mismatch' }

export async function checkSsoDomainOwnership(domain: {
  name: string
  verificationToken: string
}): Promise<SsoDomainCheck> {
  // Run when someone clicks Verify, so the lookup gets a second try.
  const result = await lookupVerificationTxt(
    `${SSO_VERIFY_RECORD_HOST}.${domain.name}`,
    interactiveResolver
  )
  if (!result.ok) return { ok: false, reason: result.reason }
  if (!result.values.includes(ssoVerifyRecordValue(domain.verificationToken))) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, via: 'dns' }
}
