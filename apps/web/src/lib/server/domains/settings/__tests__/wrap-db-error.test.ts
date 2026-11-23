import { describe, expect, it } from 'vitest'
import { wrapDbError } from '../settings.helpers'
import { InternalError, ValidationError } from '@/lib/shared/errors'

describe('wrapDbError', () => {
  it('rethrows a validation error', () => {
    const err = new ValidationError(
      'INVALID_CUSTOM_CSS',
      'Custom CSS cannot contain the "<" character'
    )
    expect(() => wrapDbError('update custom CSS', err)).toThrow(err)
  })

  it('wraps an unexpected failure as InternalError', () => {
    expect(() => wrapDbError('fetch branding config', new Error('connection reset'))).toThrow(
      InternalError
    )
  })
})
