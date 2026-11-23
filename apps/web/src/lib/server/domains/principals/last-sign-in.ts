/**
 * A member's "last sign-in" is the later of two facts: the newest session row
 * and the principal's SSO stamp. Sessions are pruned, and a password reset or
 * member removal deletes them, but `principal.last_sso_sign_in_at` is written on
 * the principal and survives that cleanup — so an SSO-only member keeps a real
 * last sign-in instead of flipping to "never".
 */
export function latestSignInAt(
  sessionAt: Date | string | null | undefined,
  ssoAt: Date | string | null | undefined
): Date | null {
  const sessionTime = sessionAt == null ? null : new Date(sessionAt)
  const ssoTime = ssoAt == null ? null : new Date(ssoAt)
  if (!sessionTime || Number.isNaN(sessionTime.getTime())) return ssoTime
  if (!ssoTime || Number.isNaN(ssoTime.getTime())) return sessionTime
  return sessionTime >= ssoTime ? sessionTime : ssoTime
}
