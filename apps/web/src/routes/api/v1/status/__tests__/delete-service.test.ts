/**
 * DELETE /api/v1/status/services/:serviceId — the API-side cleanup path a
 * monitoring integration needs (it can create/update services and incidents but
 * had no way to retire either without the control panel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERMISSIONS } from '@/lib/shared/permissions'

const mocks = vi.hoisted(() => ({
  withApiKeyAuth: vi.fn(async () => ({ role: 'admin', permissions: new Set() })),
  deleteStatusComponent: vi.fn(async () => {}),
}))

vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: mocks.withApiKeyAuth,
}))
vi.mock('@/lib/server/domains/status', () => ({
  deleteStatusComponent: mocks.deleteStatusComponent,
}))
vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: (value: string) => value,
}))

import { deleteStatusComponentHandler } from '../-service-handlers'

const request = new Request('http://localhost/api/v1/status/services/status_component_1', {
  method: 'DELETE',
})

describe('deleteStatusComponentHandler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('soft-deletes the service with STATUS_PAGE_MANAGE and returns 204', async () => {
    const response = await deleteStatusComponentHandler({
      request,
      id: 'status_component_1',
    })

    expect(mocks.withApiKeyAuth).toHaveBeenCalledWith(request, {
      permission: PERMISSIONS.STATUS_PAGE_MANAGE,
    })
    expect(mocks.deleteStatusComponent).toHaveBeenCalledWith('status_component_1')
    expect(response.status).toBe(204)
  })
})
