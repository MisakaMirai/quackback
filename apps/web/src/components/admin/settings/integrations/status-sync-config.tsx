'use client'

import { useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowPathIcon } from '@heroicons/react/24/solid'
import { Label } from '@/components/ui/label'
import { SettingRow } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/shared/copy-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { adminQueries } from '@/lib/client/queries/admin'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  useEnableStatusSync,
  useDisableStatusSync,
  useUpdateStatusMappings,
} from '@/lib/client/mutations'

/** External statuses that can be mapped (provided by the integration config component) */
export interface ExternalStatus {
  id: string
  name: string
}

interface StatusSyncConfigProps {
  integrationId: string
  integrationType: string
  config: Record<string, unknown>
  enabled: boolean
  /** External statuses from the platform (e.g., Linear workflow states) */
  externalStatuses: ExternalStatus[]
  /** Whether this platform requires manual webhook setup (vs auto-registration) */
  isManual?: boolean
}

const IGNORE_VALUE = '__ignore__'

export function StatusSyncConfig({
  integrationId,
  integrationType,
  config,
  enabled,
  externalStatuses,
  isManual = false,
}: StatusSyncConfigProps) {
  const intl = useOptionalIntl()
  const statusSyncEnabled = (config.statusSyncEnabled as boolean) ?? false
  const existingMappings = (config.statusMappings ?? {}) as Record<string, string | null>
  const webhookSecret = config.webhookSecret as string | undefined

  const [mappings, setMappings] = useState<Record<string, string | null>>(existingMappings)

  const statusesQuery = useSuspenseQuery(adminQueries.statuses())
  const quackbackStatuses = statusesQuery.data

  const enableSync = useEnableStatusSync()
  const disableSync = useDisableStatusSync()
  const updateMappings = useUpdateStatusMappings()

  const saving = enableSync.isPending || disableSync.isPending || updateMappings.isPending

  const handleSyncToggle = (checked: boolean) => {
    if (checked) {
      enableSync.mutate({ integrationId, integrationType })
    } else {
      disableSync.mutate({ integrationId, integrationType })
    }
  }

  const handleMappingChange = (externalStatusName: string, quackbackStatusId: string) => {
    const value = quackbackStatusId === IGNORE_VALUE ? null : quackbackStatusId
    const newMappings = { ...mappings, [externalStatusName]: value }
    setMappings(newMappings)
    updateMappings.mutate({ integrationId, statusMappings: newMappings })
  }

  const webhookUrl = webhookSecret
    ? `${window.location.origin}/api/integrations/${integrationType}/webhook`
    : null

  const platformName =
    integrationType.charAt(0).toUpperCase() + integrationType.slice(1).replace('_', ' ')
  const platformLabel = integrationType.replace('_', ' ')

  return (
    <div className="space-y-6 border-t border-border/50 pt-6">
      <SettingRow
        label={intl.formatMessage({
          id: 'admin.integrations.statusSync.title',
          defaultMessage: 'Status sync',
        })}
        htmlFor="status-sync-toggle"
        description={intl.formatMessage(
          {
            id: 'admin.integrations.statusSync.description',
            defaultMessage: 'Apply verified status changes from {platform} to linked posts.',
          },
          { platform: platformName }
        )}
        control={
          <Switch
            id="status-sync-toggle"
            checked={statusSyncEnabled}
            onCheckedChange={handleSyncToggle}
            disabled={saving || !enabled}
          />
        }
      />

      {statusSyncEnabled && isManual && webhookUrl && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {intl.formatMessage({
                id: 'admin.integrations.statusSync.webhookUrl',
                defaultMessage: 'Webhook URL',
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(
                {
                  id: 'admin.integrations.statusSync.webhookUrlHint',
                  defaultMessage: 'Copy this URL into your {name} webhook settings.',
                },
                { name: platformLabel }
              )}
            </p>
            <CopyableValue value={webhookUrl} />
          </div>
          {webhookSecret && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {intl.formatMessage({
                  id: 'admin.webhooks.signingSecret',
                  defaultMessage: 'Signing secret',
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.integrations.statusSync.signingSecretHint',
                  defaultMessage:
                    'Paste this as the webhook payload secret so status updates can be verified.',
                })}
              </p>
              <CopyableValue value={webhookSecret} />
            </div>
          )}
        </div>
      )}

      {statusSyncEnabled && externalStatuses.length > 0 && (
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">
              {intl.formatMessage({
                id: 'admin.integrations.statusSync.mappingTitle',
                defaultMessage: 'Status mapping',
              })}
            </Label>
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.integrations.statusSync.mappingDescription',
                defaultMessage:
                  'Map external statuses to Quackback statuses. Unmapped statuses are ignored.',
              })}
            </p>
          </div>

          <div className="space-y-2">
            {externalStatuses.map((ext) => (
              <div
                key={ext.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-3"
              >
                <span className="text-sm font-medium min-w-0 truncate">{ext.name}</span>
                <Select
                  value={mappings[ext.name] ?? IGNORE_VALUE}
                  onValueChange={(value) => handleMappingChange(ext.name, value)}
                  disabled={saving || !enabled}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={IGNORE_VALUE}>
                      <span className="text-muted-foreground">
                        {intl.formatMessage({
                          id: 'admin.integrations.statusSync.ignore',
                          defaultMessage: 'Ignore',
                        })}
                      </span>
                    </SelectItem>
                    {quackbackStatuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span>
            {intl.formatMessage({
              id: 'admin.integrations.config.saving',
              defaultMessage: 'Saving...',
            })}
          </span>
        </div>
      )}

      {(enableSync.isError || disableSync.isError || updateMappings.isError) && (
        <div className="text-sm text-destructive">
          {enableSync.error?.message ||
            disableSync.error?.message ||
            updateMappings.error?.message ||
            intl.formatMessage({
              id: 'admin.integrations.config.saveFailed',
              defaultMessage: 'Failed to save changes',
            })}
        </div>
      )}
    </div>
  )
}

/** A read-only value shown in a code block with a copy-to-clipboard button. */
function CopyableValue({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="ph-mask flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
        {value}
      </code>
      <CopyButton value={value} variant="outline" size="sm" />
    </div>
  )
}
