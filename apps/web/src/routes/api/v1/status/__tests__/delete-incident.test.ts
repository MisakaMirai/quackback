/**
 * DELETE /api/v1/status/incidents/:incidentId — lets a monitoring integration
 * remove a test incident/maintenance window it opened through the API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERMISSIONS } from '@/lib/shared/permissions'

const mocks = vi.hoisted(() => ({
  withApiKeyAuth: vi.fn(async () => ({ role: 'admin', permissions: new Set() })),
  deleteIncident: vi.fn(async () => {}),
}))

vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: mocks.withApiKeyAuth,
}))
vi.mock('@/lib/server/domains/status', () => ({
  deleteIncident: mocks.deleteIncident,
}))
vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: (value: string) => value,
}))

import { deleteStatusIncidentHandler } from '../-incident-handlers'

const request = new Request('http://localhost/api/v1/status/incidents/status_incident_1', {
  method: 'DELETE',
})

describe('deleteStatusIncidentHandler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('soft-deletes the incident with STATUS_PAGE_PUBLISH and returns 204', async () => {
    const response = await deleteStatusIncidentHandler({
      request,
      id: 'status_incident_1',
    })

    expect(mocks.withApiKeyAuth).toHaveBeenCalledWith(request, {
      permission: PERMISSIONS.STATUS_PAGE_PUBLISH,
    })
    expect(mocks.deleteIncident).toHaveBeenCalledWith('status_incident_1')
    expect(response.status).toBe(204)
  })
})
