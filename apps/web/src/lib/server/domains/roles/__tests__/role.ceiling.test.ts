import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS } from '@/lib/shared/permissions'
import { ForbiddenError, ValidationError } from '@/lib/shared/errors'
import { assertKnownPermissions, assertWithinCeiling } from '../role.ceiling'

/**
 * The pure half of the role grant ceiling: unknown keys are rejected against
 * the catalogue, and a role's bundle may not exceed the keys its author holds.
 */
describe('assertKnownPermissions', () => {
  it('accepts the whole catalogue', () => {
    expect(() => assertKnownPermissions([...ALL_PERMISSIONS])).not.toThrow()
  })

  it('accepts an empty list', () => {
    expect(() => assertKnownPermissions([])).not.toThrow()
  })

  it('rejects an unknown key and names it', () => {
    expect(() => assertKnownPermissions(['not.a.permission' as never])).toThrow(ValidationError)
    expect(() => assertKnownPermissions(['not.a.permission' as never])).toThrow(
      'Unknown permissions: not.a.permission'
    )
  })

  it('names every unknown key, in input order', () => {
    const attempt = () => assertKnownPermissions(['zzz.one', 'zzz.two'] as never)
    expect(attempt).toThrow('Unknown permissions: zzz.one, zzz.two')
  })
})

describe('assertWithinCeiling', () => {
  const [first, second] = ALL_PERMISSIONS

  it('passes when every key is held', () => {
    expect(() => assertWithinCeiling([first], new Set([first, second]))).not.toThrow()
  })

  it('passes an empty bundle', () => {
    expect(() => assertWithinCeiling([], new Set())).not.toThrow()
  })

  it('rejects a key outside the held set as a GRANT_CEILING refusal', () => {
    expect(() => assertWithinCeiling([first, second], new Set([first]))).toThrow(ForbiddenError)
    try {
      assertWithinCeiling([first, second], new Set([first]))
      expect.unreachable('expected a refusal')
    } catch (error) {
      expect((error as ForbiddenError).code).toBe('GRANT_CEILING')
    }
  })

  it('names the refused keys sorted, not in input order', () => {
    const attempt = () => assertWithinCeiling([second, first], new Set())
    const expected = [first, second].sort().join(', ')
    expect(attempt).toThrow(`You can't grant permissions you don't hold: ${expected}`)
  })

  it('uses the surface-specific message it is given', () => {
    expect(() => assertWithinCeiling([first], new Set(), 'Custom ceiling text')).toThrow(
      `Custom ceiling text: ${first}`
    )
  })
})
