/**
 * The admin subscribe paths (manual add, CSV import) against real Postgres:
 * the opt-out guard is an ON CONFLICT ... WHERE, so only the database can
 * prove that someone who unsubscribed stays unsubscribed.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createId, type PrincipalId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { eq, principal, statusSubscriptions, user } from '@/lib/server/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

import {
  addStatusSubscriberByEmail,
  importStatusSubscribersFromEmails,
  removeStatusSubscriberByAdmin,
  subscribe,
  unsubscribe,
} from '../status.subscription'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: statusSubscriptions.id }).from(statusSubscriptions).limit(0)
  },
})

async function person(email: string): Promise<PrincipalId> {
  const userId = createId('user')
  const principalId = createId('principal')
  await testDb.insert(user).values({ id: userId, name: email, email })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role: 'user', type: 'user', createdAt: new Date() })
  return principalId
}

async function subscription(principalId: PrincipalId) {
  return testDb.query.statusSubscriptions.findFirst({
    where: eq(statusSubscriptions.principalId, principalId),
  })
}

describe('admin subscribe paths (Postgres)', () => {
  beforeEach(async () => {
    expect(fixture.available).toBe(true)
    await fixture.begin()
  })
  afterEach(fixture.rollback)

  it('adding someone who unsubscribed skips them and keeps the opt-out', async () => {
    const id = await person('optedout@example.com')
    await subscribe(id, 'page', [], 'self_serve')
    await unsubscribe(id)

    expect(await addStatusSubscriberByEmail('OptedOut@example.com')).toEqual({ subscribed: false })
    expect((await subscription(id))?.unsubscribedAt).not.toBeNull()
  })

  it('adding someone new or already subscribed subscribes them', async () => {
    const fresh = await person('fresh@example.com')
    const active = await person('active@example.com')
    await subscribe(active, 'page', [], 'self_serve')

    expect(await addStatusSubscriberByEmail('fresh@example.com')).toEqual({ subscribed: true })
    expect(await addStatusSubscriberByEmail('active@example.com')).toEqual({ subscribed: true })
    expect(await subscription(fresh)).toMatchObject({ source: 'admin', unsubscribedAt: null })
    expect(await subscription(active)).toMatchObject({ source: 'self_serve', unsubscribedAt: null })
  })

  it('an import skips people who unsubscribed and reports them apart', async () => {
    const optedOut = await person('optedout@example.com')
    await person('known@example.com')
    await subscribe(optedOut, 'page', [], 'self_serve')
    await unsubscribe(optedOut)

    const result = await importStatusSubscribersFromEmails([
      'optedout@example.com',
      'known@example.com',
      'ghost@example.com',
    ])

    expect(result).toEqual({ imported: 1, skipped: 1, optedOut: 1, total: 3 })
    expect((await subscription(optedOut))?.unsubscribedAt).not.toBeNull()
  })

  it('a person can still re-subscribe themselves after opting out', async () => {
    const id = await person('back@example.com')
    await subscribe(id, 'page', [], 'self_serve')
    await unsubscribe(id)
    await subscribe(id, 'page', [], 'self_serve')

    expect((await subscription(id))?.unsubscribedAt).toBeNull()
  })
})

describe('admin removal (Postgres)', () => {
  beforeEach(async () => {
    expect(fixture.available).toBe(true)
    await fixture.begin()
  })
  afterEach(fixture.rollback)

  it('unsubscribes an active subscriber and keeps the row', async () => {
    const id = await person('removed@example.com')
    await subscribe(id, 'page', [], 'self_serve')

    expect(await removeStatusSubscriberByAdmin(id)).toEqual({ removed: true })
    const row = await subscription(id)
    expect(row).toBeDefined()
    expect(row?.unsubscribedAt).not.toBeNull()
    expect(row?.source).toBe('self_serve')
  })

  it('leaves an existing opt-out and its original time untouched', async () => {
    const id = await person('optedout@example.com')
    await subscribe(id, 'page', [], 'self_serve')
    await unsubscribe(id)
    const before = (await subscription(id))?.unsubscribedAt

    expect(await removeStatusSubscriberByAdmin(id)).toEqual({ removed: false })
    expect((await subscription(id))?.unsubscribedAt).toEqual(before)
  })

  it('reports nothing removed for a person with no subscription', async () => {
    const id = await person('never@example.com')

    expect(await removeStatusSubscriberByAdmin(id)).toEqual({ removed: false })
    expect(await subscription(id)).toBeUndefined()
  })

  it('keeps the opt-out for admin adds, and lets the person re-subscribe themselves', async () => {
    const id = await person('back@example.com')
    await subscribe(id, 'page', [], 'self_serve')
    await removeStatusSubscriberByAdmin(id)

    expect(await addStatusSubscriberByEmail('back@example.com')).toEqual({ subscribed: false })

    await subscribe(id, 'page', [], 'self_serve')
    expect((await subscription(id))?.unsubscribedAt).toBeNull()
  })
})

afterAll(fixture.close)
