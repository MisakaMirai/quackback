/**
 * PATCH /api/v1/status/components/:id auth + atomicity.
 *
 * Two things this pins:
 *  - Flipping the live status is a publish (STATUS_PAGE_PUBLISH); editing the
 *    component's metadata stays a management action (STATUS_PAGE_MANAGE). A
 *    single PATCH can need either or both.
 *  - Both writes run in the caller's transaction, so a failed status write
 *    cannot leave a committed metadata edit behind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERMISSIONS } from '@/lib/shared/permissions'

const assertPermissions = vi.fn()
const updateStatusComponent = vi.fn(async () => ({}))
const setComponentStatus = vi.fn(async () => {})
const transaction = vi.fn()
const findFirst = vi.fn()

vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: vi.fn(async () => ({ role: 'admin', permissions: new Set() })),
  assertApiPermissions: (...args: unknown[]) => assertPermissions(...args),
}))

vi.mock('@/lib/server/domains/status', () => ({
  updateStatusComponent,
  setComponentStatus,
}))

vi.mock('@/lib/server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/db')>()
  return {
    ...actual,
    db: {
      // Run the callback with a sentinel transaction handle so the test can
      // assert both writes received the same one.
      transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
      query: { statusComponents: { findFirst: () => findFirst() } },
    },
  }
})

vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: (value: string) => value,
  parseTypeIdArray: (value: string[] | undefined) => value,
}))

import { patchStatusComponentHandler } from '../-service-handlers'

const TX = { marker: 'transaction' }

const componentRow = {
  id: 'status_component_1',
  groupId: null,
  name: 'API',
  description: null,
  status: 'degraded_performance',
  position: 0,
  showUptime: true,
  segmentIds: [],
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/v1/status/components/status_component_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('patchStatusComponentHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(TX))
    findFirst.mockResolvedValue(componentRow)
  })

  it('gates a status-only PATCH on STATUS_PAGE_PUBLISH', async () => {
    const response = await patchStatusComponentHandler({
      request: patchRequest({ status: 'degraded_performance' }),
      id: 'status_component_1',
    })

    expect(response.status).toBe(200)
    expect(assertPermissions).toHaveBeenCalledTimes(1)
    expect(assertPermissions).toHaveBeenCalledWith(expect.anything(), [
      PERMISSIONS.STATUS_PAGE_PUBLISH,
    ])
    expect(updateStatusComponent).not.toHaveBeenCalled()
    expect(setComponentStatus).toHaveBeenCalledWith(
      'status_component_1',
      'degraded_performance',
      'api',
      null,
      TX
    )
  })

  it('gates a metadata-only PATCH on STATUS_PAGE_MANAGE', async () => {
    const response = await patchStatusComponentHandler({
      request: patchRequest({ name: 'API v2' }),
      id: 'status_component_1',
    })

    expect(response.status).toBe(200)
    expect(assertPermissions).toHaveBeenCalledTimes(1)
    expect(assertPermissions).toHaveBeenCalledWith(expect.anything(), [
      PERMISSIONS.STATUS_PAGE_MANAGE,
    ])
    expect(setComponentStatus).not.toHaveBeenCalled()
    expect(updateStatusComponent).toHaveBeenCalledWith(
      'status_component_1',
      expect.objectContaining({ name: 'API v2' }),
      TX
    )
  })

  it('requires both permissions and one transaction when both change', async () => {
    const response = await patchStatusComponentHandler({
      request: patchRequest({ name: 'API v2', status: 'operational' }),
      id: 'status_component_1',
    })

    expect(response.status).toBe(200)
    expect(assertPermissions.mock.calls.map((call) => call[1])).toEqual([
      [PERMISSIONS.STATUS_PAGE_MANAGE],
      [PERMISSIONS.STATUS_PAGE_PUBLISH],
    ])
    expect(updateStatusComponent).toHaveBeenCalledWith(
      'status_component_1',
      expect.objectContaining({ name: 'API v2' }),
      TX
    )
    expect(setComponentStatus).toHaveBeenCalledWith(
      'status_component_1',
      'operational',
      'api',
      null,
      TX
    )
  })

  it('does not commit metadata when the status write fails', async () => {
    setComponentStatus.mockRejectedValueOnce(new Error('component gone'))

    const response = await patchStatusComponentHandler({
      request: patchRequest({ name: 'API v2', status: 'operational' }),
      id: 'status_component_1',
    })

    // The transaction is what rolls the metadata back; the handler reports the
    // failure rather than a 200 with a half-applied row.
    expect(response.status).toBe(500)
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
