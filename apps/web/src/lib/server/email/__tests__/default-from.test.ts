/**
 * The default From is the install's own `EMAIL_FROM`.
 *
 * Pins the production install in `ensureEmailLogSink`, not a copy of the
 * resolver. `registered` is once-per-process, so this file does not reset the
 * resolver between cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmailFrom, platformFromPreview } from '@quackback/email'
import { ensureEmailLogSink } from '../email-log.sink'

describe('default From', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'Selfhost <noreply@self.example>')
    ensureEmailLogSink()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is EMAIL_FROM', () => {
    expect(getEmailFrom()).toBe('Selfhost <noreply@self.example>')
  })

  it("keeps the operator's own From name for the install's mail", () => {
    expect(platformFromPreview('Acme')).toBe('Selfhost <noreply@self.example>')
  })
})
