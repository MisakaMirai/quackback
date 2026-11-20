/** Invitation id from a magic-link callback URL (`/complete-signup/…` or `/portal-invite/…`). */
export function parseInvitationId(callbackURL: string | undefined): string | null {
  if (!callbackURL) return null
  try {
    // Callbacks are stored as same-origin paths, so resolve against a sentinel
    // base rather than requiring an absolute URL.
    const path = new URL(callbackURL, 'https://callback.invalid').pathname
    const match = path.match(/\/(?:complete-signup|portal-invite)\/(invite_[a-z0-9]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}
