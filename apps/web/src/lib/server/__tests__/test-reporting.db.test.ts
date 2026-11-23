import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createId, type PrincipalId } from '@quackback/ids'
import { createDbTestFixture, testDb } from './db-test-fixture'
import { conversationAttributeDefinitions, conversations, principal } from '@/lib/server/db'
import { attributeValueCounts } from '../domains/conversation-attributes/attribute-value-counts.service'
import { attributeValueBreakdown } from '../domains/conversation-attributes/attribute-reporting'

vi.mock('@/lib/server/db', async (original) => ({
  ...(await original<typeof import('@/lib/server/db')>()),
  db: (await import('./db-test-fixture')).testDb,
}))

const fixture = await createDbTestFixture()
let owner: PrincipalId, customer: PrincipalId, ordinary: PrincipalId
let key: string
const from = new Date('2035-04-01T00:00:00Z')
const at = new Date('2035-04-01T12:00:00Z')
const to = new Date('2035-04-02T00:00:00Z')

beforeEach(async () => {
  expect(fixture.available).toBe(true)
  expect(process.env.DATABASE_URL).toMatch(/\/quackback_test(?:_\w+)?(?:\?|$)/)
  await fixture.begin()
  owner = createId('principal')
  customer = createId('principal')
  ordinary = createId('principal')
  key = `acme_${createId('conversation_attribute')}`
  await testDb.insert(principal).values([
    { id: owner, type: 'user', role: 'admin', createdAt: at },
    { id: ordinary, type: 'user', role: 'user', createdAt: at },
  ])
  await testDb.insert(principal).values({
    id: customer,
    type: 'anonymous',
    role: 'user',
    testOwnerPrincipalId: owner,
    createdAt: at,
  })
  await testDb.insert(conversationAttributeDefinitions).values({
    key,
    label: 'Acme category',
    fieldType: 'select',
    options: [
      { id: 'real_option', label: 'Real' },
      { id: 'test_option', label: 'Test' },
    ],
  })
})
afterEach(fixture.rollback)
afterAll(fixture.close)

/**
 * Only the test customer's threads carry `test_option`. The teammate's own
 * thread and the legacy client markers are real data and carry `real_option`,
 * so excluding them, or keeping a test thread, both change a count.
 */
async function seedConversations() {
  const realValue = { [key]: { v: 'real_option' } }
  return testDb
    .insert(conversations)
    .values([
      {
        visitorPrincipalId: ordinary,
        customAttributes: realValue,
        channel: 'messenger',
        createdAt: at,
      },
      { visitorPrincipalId: ordinary, customAttributes: {}, channel: 'messenger', createdAt: at },
      {
        visitorPrincipalId: customer,
        customAttributes: { [key]: { v: 'test_option' } },
        channel: 'messenger',
        createdAt: at,
      },
      { visitorPrincipalId: customer, customAttributes: {}, channel: 'messenger', createdAt: at },
      {
        visitorPrincipalId: owner,
        customAttributes: { ...realValue, test: true },
        channel: 'messenger',
        createdAt: at,
      },
      {
        visitorPrincipalId: ordinary,
        customAttributes: { ...realValue, test: 'true' },
        channel: 'messenger',
        createdAt: at,
      },
      {
        visitorPrincipalId: ordinary,
        customAttributes: { ...realValue, onboardingGenerated: true },
        channel: 'messenger',
        createdAt: at,
      },
    ])
    .returning({ id: conversations.id })
}

it('keeps test identities out of attribute detection counts, including unset, and counts legacy markers', async () => {
  const baseline = await attributeValueCounts({ key })
  const beforeUnset = baseline.find((row) => row.optionId === null)!.count
  await seedConversations()
  const counts = await attributeValueCounts({ key })
  expect(counts.find((row) => row.optionId === 'real_option')!.count).toBe(4)
  expect(counts.find((row) => row.optionId === 'test_option')!.count).toBe(0)
  expect(counts.find((row) => row.optionId === null)!.count).toBe(beforeUnset + 1)
})

it('keeps test identities out of the date-window attribute breakdown and counts legacy markers', async () => {
  const baseline = await attributeValueBreakdown(key, from, to)
  await seedConversations()
  expect(await attributeValueBreakdown(key, from, to)).toEqual({
    values: [{ value: 'real_option', count: 4 }],
    unset: baseline.unset + 1,
  })
})
