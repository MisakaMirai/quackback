import { describe, it, expect } from 'vitest'
import { parseOptionalDate } from '../-validation'

describe('parseOptionalDate', () => {
  it('keeps undefined and null distinct (untouched vs clear)', () => {
    expect(parseOptionalDate(undefined)).toBeUndefined()
    expect(parseOptionalDate(null)).toBeNull()
  })

  it('parses an ISO datetime', () => {
    expect(parseOptionalDate('2026-11-20T12:00:00.000Z')?.toISOString()).toBe(
      '2026-11-20T12:00:00.000Z'
    )
  })

  it('rejects an unparseable value instead of returning an Invalid Date', () => {
    expect(() => parseOptionalDate('not-a-date')).toThrow(/Invalid date/)
    try {
      parseOptionalDate('not-a-date')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('VALIDATION_ERROR')
    }
  })
})
