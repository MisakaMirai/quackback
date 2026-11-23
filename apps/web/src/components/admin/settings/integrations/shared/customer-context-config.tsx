import { SettingRow } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import { useUpdateIntegration } from '@/lib/client/mutations'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

export function CustomerContextConfig({
  integrationId,
  enabled,
}: {
  integrationId: string
  enabled: boolean
}) {
  const intl = useOptionalIntl()
  const update = useUpdateIntegration()
  return (
    <div className="space-y-3">
      <SettingRow
        label={intl.formatMessage({
          id: 'admin.integrations.customerContext.label',
          defaultMessage: 'Customer context',
        })}
        htmlFor={`context-${integrationId}`}
        description={intl.formatMessage({
          id: 'admin.integrations.customerContext.description',
          defaultMessage: 'Look up customer details by email when you open customer context.',
        })}
        control={
          <Switch
            id={`context-${integrationId}`}
            checked={enabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => update.mutate({ id: integrationId, enabled: checked })}
          />
        }
      />
      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message || 'Failed to save changes'}
        </p>
      )}
    </div>
  )
}
