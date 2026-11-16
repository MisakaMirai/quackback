'use client'

import { SettingRow } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import { useUpdateIntegration } from '@/lib/client/mutations'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  getIntegrationActionVerb,
  getIntegrationDisplayName,
} from '@/components/admin/settings/integrations/integration-ui'

interface OnDeleteConfigProps {
  integrationId: string
  integrationType: string
  config: Record<string, unknown>
  enabled: boolean
}

export function OnDeleteConfig({
  integrationId,
  integrationType,
  config,
  enabled,
}: OnDeleteConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const onDeleteAction = (config.onDeleteAction as string) ?? 'nothing'
  const isChecked = onDeleteAction === 'archive'
  const saving = updateMutation.isPending

  const action = getIntegrationActionVerb(integrationType)
  const name = getIntegrationDisplayName(integrationType)

  const handleToggle = (checked: boolean) => {
    updateMutation.mutate({
      id: integrationId,
      config: { onDeleteAction: checked ? 'archive' : 'nothing' },
    })
  }

  return (
    <div className="space-y-2 border-t border-border/50 pt-6">
      <SettingRow
        label={intl.formatMessage({
          id: 'admin.integrations.onDelete.label',
          defaultMessage: 'On post delete',
        })}
        htmlFor="on-delete-toggle"
        description={intl.formatMessage({
          id: 'admin.integrations.onDelete.description',
          defaultMessage: 'Review linked issues when a post is deleted',
        })}
        control={
          <Switch
            id="on-delete-toggle"
            checked={isChecked}
            onCheckedChange={handleToggle}
            disabled={saving || !enabled}
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        {intl.formatMessage(
          {
            id: 'admin.integrations.onDelete.body',
            defaultMessage:
              'When enabled, the delete dialog selects linked {name} issues for review in Sync history. Open each issue on {name} to {action} it.',
          },
          { name, action: action.toLowerCase() }
        )}
      </p>
    </div>
  )
}
