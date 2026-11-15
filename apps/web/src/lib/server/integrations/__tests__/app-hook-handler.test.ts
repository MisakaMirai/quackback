import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  handle: vi.fn(),
  deliveryId: vi.fn(),
  verify: vi.fn(),
  credentials: vi.fn(),
}))
vi.mock('@/lib/server/db', () => ({
  db: { transaction: mocks.transaction },
  integrationDeliveries: {},
}))
vi.mock('../index', () => ({
  getIntegration: () => ({
    appHooks: {
      kinds: ['events'],
      verify: mocks.verify,
      deliveryId: mocks.deliveryId,
      handle: mocks.handle,
    },
  }),
}))
vi.mock('@/lib/server/domains/platform-credentials/platform-credential.service', () => ({
  getPlatformCredentials: mocks.credentials,
}))
import { handleAppHook } from '../app-hook-handler'
import { verifySlackSignature } from '@/integrations/slack/server/verify'
const raw = JSON.stringify({ event_id: 'Ev1' })
const ts = '1788600000'
function request(provider = true, body = raw) {
  return new Request('https://tenant.example/api/integrations/slack/hooks/events', {
    method: 'POST',
    body,
    headers: {
      ...(provider
        ? {
            'x-slack-request-timestamp': ts,
            'x-slack-signature': `v0=${createHmac('sha256', 'slack-secret').update(`v0:${ts}:${raw}`).digest('hex')}`,
          }
        : {}),
    },
  })
}
let inserted: unknown[]
let tx: any
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(Number(ts) * 1000)
  inserted = [{}]
  tx = {
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: async () => inserted }) }),
    }),
  }
  mocks.transaction.mockImplementation((fn) => fn(tx))
  mocks.credentials.mockResolvedValue({ signingSecret: 'slack-secret' })
  mocks.verify.mockImplementation(
    ({ headers, rawBody, credentials }) =>
      verifySlackSignature(
        rawBody,
        headers.get('x-slack-request-timestamp'),
        headers.get('x-slack-signature'),
        credentials.signingSecret
      ) === true
  )
  mocks.deliveryId.mockReturnValue('Ev1')
  mocks.handle.mockResolvedValue(new Response(null, { status: 200 }))
})
afterEach(() => vi.useRealTimers())
describe('app hook trust boundary', () => {
  it('verifies the provider and rejects tampered bodies before enqueue', async () => {
    expect((await handleAppHook(request(false), 'slack', 'events')).status).toBe(401)
    expect((await handleAppHook(request(true, raw + ' '), 'slack', 'events')).status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects a provider timestamp outside the replay window', async () => {
    vi.setSystemTime((Number(ts) + 301) * 1000)
    expect((await handleAppHook(request(), 'slack', 'events')).status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('accepts a fresh provider signature', async () => {
    expect((await handleAppHook(request(), 'slack', 'events')).status).toBe(200)
  })
  it('deduplicates before the handler and uses the receipt transaction for enqueue', async () => {
    expect((await handleAppHook(request(), 'slack', 'events')).status).toBe(200)
    expect(mocks.handle).toHaveBeenCalledWith('events', raw, 'text/plain;charset=UTF-8', tx)
    inserted = []
    expect((await handleAppHook(request(), 'slack', 'events')).status).toBe(200)
    expect(mocks.handle).toHaveBeenCalledTimes(1)
  })
  it('propagates handler failure out of the transaction so receipt insertion rolls back', async () => {
    mocks.handle.mockRejectedValue(new Error('enqueue unavailable'))
    expect((await handleAppHook(request(), 'slack', 'events')).status).toBe(503)
  })
  it('bounds the streamed body and rejects unsupported kinds', async () => {
    expect(
      (await handleAppHook(request(true, 'x'.repeat(1048577)), 'slack', 'events')).status
    ).toBe(413)
    expect((await handleAppHook(request(), 'slack', 'unknown')).status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
