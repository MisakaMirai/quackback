import { describe, expect, it } from 'vitest'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/shared/errors'
import { toApiKeyRefusal } from '../api-key-refusal'

/**
 * The API-key dialog's error boundary: expected service failures become a
 * refusal it can render, and anything else stays a throw (a real fault must
 * not be silently turned into a message).
 */
describe('toApiKeyRefusal', () => {
  it('maps a not-found error to NOT_FOUND with its message', () => {
    expect(toApiKeyRefusal(new NotFoundError('API_KEY_NOT_FOUND', 'Key is gone'))).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Key is gone',
    })
  })

  it('maps a forbidden error to GRANT_CEILING with its message', () => {
    expect(toApiKeyRefusal(new ForbiddenError('GRANT_CEILING', 'Above your ceiling'))).toEqual({
      ok: false,
      code: 'GRANT_CEILING',
      message: 'Above your ceiling',
    })
  })

  it('maps a validation error to INVALID with its message', () => {
    expect(toApiKeyRefusal(new ValidationError('VALIDATION_ERROR', 'Bad scope'))).toEqual({
      ok: false,
      code: 'INVALID',
      message: 'Bad scope',
    })
  })

  it('leaves a domain error it has no refusal for to throw', () => {
    expect(toApiKeyRefusal(new ConflictError('CONFLICT', 'Race'))).toBeNull()
  })

  it('leaves non-domain failures to throw', () => {
    expect(toApiKeyRefusal(new Error('boom'))).toBeNull()
    expect(toApiKeyRefusal('not an error')).toBeNull()
    expect(toApiKeyRefusal(null)).toBeNull()
  })
})
