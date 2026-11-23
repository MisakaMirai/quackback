/**
 * Shared handler body for the status-incident REST surface.
 *
 * Not a route itself (the `-` prefix opts it out of file-based routing), so the
 * route file stays routing-only and the handler is directly testable.
 */
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { noContentResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { PERMISSIONS } from '@/lib/shared/permissions'
import type { StatusIncidentId } from '@quackback/ids'

/**
 * DELETE /api/v1/status/incidents/:incidentId
 *
 * Soft-deletes an incident or maintenance window, releasing the services it was
 * holding down. Monitoring integrations can clean up test events without the
 * control panel.
 */
export async function deleteStatusIncidentHandler({
  request,
  id,
}: {
  request: Request
  id: string
}) {
  try {
    await withApiKeyAuth(request, { permission: PERMISSIONS.STATUS_PAGE_PUBLISH })

    const incidentId = parseTypeId<StatusIncidentId>(id, 'status_incident', 'incident ID')

    const { deleteIncident } = await import('@/lib/server/domains/status')
    await deleteIncident(incidentId)

    return noContentResponse()
  } catch (error) {
    return handleDomainError(error)
  }
}
