/**
 * Whether the browser asks not to be tracked: Do Not Track, or Global Privacy
 * Control (which some jurisdictions treat as a legal opt-out, and some
 * browsers send by default). Every analytics surface honours it the same way.
 */
export function browserOptedOutOfTracking(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true
}
