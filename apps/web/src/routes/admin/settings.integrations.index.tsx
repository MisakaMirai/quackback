import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { assertRoutePermission } from '@/lib/shared/route-permission'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { adminQueries } from '@/lib/client/queries/admin'
import { IntegrationsSettingsBody } from '@/components/admin/settings/integrations/integrations-settings-body'
import { readBatch } from '@/lib/client/queries/read-batch'
import { adminPageHead } from '@/lib/client/admin-head'

export const Route = createFileRoute('/admin/settings/integrations/')({
  head: adminPageHead('Integrations settings'),
  loader: async ({ context }) => {
    assertRoutePermission(context.permissions, PERMISSIONS.INTEGRATION_VIEW)
    const ensure = readBatch(context.queryClient)
    await Promise.all([
      ensure(adminQueries.integrationCatalog()),
      ensure(adminQueries.integrations()),
    ])
  },
  component: IntegrationsPage,
})

function IntegrationsPage() {
  const catalogQuery = useSuspenseQuery(adminQueries.integrationCatalog())
  const integrationsQuery = useSuspenseQuery(adminQueries.integrations())

  // Map to simplified status format for the catalog
  const integrations = integrationsQuery.data.map((i) => ({
    id: i.integrationType,
    status: i.status as 'active' | 'paused' | 'error',
  }))

  return (
    <SettingsPage page="/admin/settings/integrations" width="wide">
      <IntegrationsSettingsBody catalog={catalogQuery.data} integrations={integrations} />
    </SettingsPage>
  )
}
