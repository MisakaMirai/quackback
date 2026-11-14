import { IntegrationList } from '@/components/admin/settings/integrations/integration-list'

export function IntegrationsSettingsBody(props: {
  catalog: Parameters<typeof IntegrationList>[0]['catalog']
  integrations: Parameters<typeof IntegrationList>[0]['integrations']
}) {
  return <IntegrationList catalog={props.catalog} integrations={props.integrations} />
}
