/**
 * Coverage for the attribute-definition service that backs the user-attribute
 * domain: validation, key normalization, id prefix, and error codes.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createDbTestFixture } from '@/lib/server/__tests__/db-test-fixture'
import { userAttributeDefinitions } from '@/lib/server/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

import {
  listUserAttributes,
  createUserAttribute,
  updateUserAttribute,
  deleteUserAttribute,
} from '@/lib/server/domains/user-attributes/user-attribute.service'
import { normalizeAttributeKey } from '@/lib/server/domains/attribute-definitions/attribute-definition.service'
import { createId } from '@quackback/ids'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: userAttributeDefinitions.id }).from(userAttributeDefinitions).limit(0)
  },
})

const suffix = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

describe('normalizeAttributeKey', () => {
  it('trims, lowercases, and underscorizes whitespace', () => {
    expect(normalizeAttributeKey('  Contract Value ')).toBe('contract_value')
  })
})

describe.skipIf(!fixture.available)('user attribute definitions (real DB, rolled back)', () => {
  beforeEach(fixture.begin)
  afterEach(fixture.rollback)
  afterAll(fixture.close)

  it('mints the user attribute id prefix', async () => {
    const user = await createUserAttribute({ key: `u_${suffix()}`, label: 'U', type: 'string' })
    expect(user.id.startsWith('user_attr_')).toBe(true)
  })

  it('rejects missing key/label/currency', async () => {
    await expect(
      createUserAttribute({ key: '  ', label: 'X', type: 'string' })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    await expect(
      createUserAttribute({ key: `k_${suffix()}`, label: '  ', type: 'string' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      createUserAttribute({ key: `k_${suffix()}`, label: 'X', type: 'currency' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('normalizes keys', async () => {
    const raw = `Parity Key ${suffix()}`
    const expected = raw.toLowerCase().replace(/\s+/g, '_')
    const user = await createUserAttribute({ key: raw, label: 'U', type: 'string' })
    expect(user.key).toBe(expected)
  })

  it('names the entity in not-found errors', async () => {
    // Well-formed but never-created ids reach the not-found branch.
    const missingUser = createId('user_attr')
    await expect(deleteUserAttribute(missingUser)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('User attribute'),
    })
  })

  it('clears the currency code when switching away from currency', async () => {
    const attribute = await createUserAttribute({
      key: `spend_${suffix()}`,
      label: 'Spend',
      type: 'currency',
      currencyCode: 'EUR',
    })
    const updated = await updateUserAttribute(attribute.id, { type: 'number' })
    expect(updated.currencyCode).toBeNull()
  })

  it('lists through the shared implementation', async () => {
    const key = `listed_${suffix()}`
    await createUserAttribute({ key, label: 'Listed', type: 'string' })
    expect((await listUserAttributes()).map((a) => a.key)).toContain(key)
  })
})
