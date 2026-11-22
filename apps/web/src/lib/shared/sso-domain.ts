/**
 * The DNS TXT record a single sign-on domain is verified with. Shared so the
 * settings page can show the record and the server can read it.
 */

/** The label a single sign-on domain's verification TXT is published under. */
export const SSO_VERIFY_RECORD_HOST = '_quackback-verify'

/** The value of a single sign-on domain's verification TXT. */
export function ssoVerifyRecordValue(token: string): string {
  return `qb-domain-verify=${token}`
}
