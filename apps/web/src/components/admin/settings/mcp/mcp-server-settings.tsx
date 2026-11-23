import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { ArrowPathIcon } from '@heroicons/react/24/solid'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { Switch } from '@/components/ui/switch'
import { updateDeveloperConfigFn } from '@/lib/server/functions/settings'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

interface McpServerSettingsProps {
  initialEnabled: boolean
  initialDynamicRegistrationEnabled: boolean
}

function BusySwitch({
  id,
  label,
  checked,
  disabled,
  busy,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  busy: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <>
      {busy && <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </>
  )
}

export function McpServerSettings({
  initialEnabled,
  initialDynamicRegistrationEnabled,
}: McpServerSettingsProps) {
  const intl = useOptionalIntl()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [dynamicRegistration, setDynamicRegistration] = useState(initialDynamicRegistrationEnabled)

  const save = async (data: {
    mcpEnabled?: boolean
    oauthDynamicClientRegistrationEnabled?: boolean
  }) => {
    setSaving(true)
    try {
      await updateDeveloperConfigFn({ data })
      startTransition(() => {
        router.invalidate()
      })
    } catch (error) {
      throw error
    } finally {
      setSaving(false)
    }
  }

  const isBusy = saving || isPending

  return (
    <>
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.mcp.server.label',
            defaultMessage: 'MCP server',
          })}
          htmlFor="mcp-toggle"
          description={intl.formatMessage({
            id: 'admin.settings.mcp.server.description',
            defaultMessage: 'Let AI coding tools work with your feedback over MCP.',
          })}
          control={
            <BusySwitch
              id="mcp-toggle"
              label={intl.formatMessage({
                id: 'admin.settings.mcp.server.label',
                defaultMessage: 'MCP server',
              })}
              checked={enabled}
              disabled={isBusy}
              busy={isBusy}
              onCheckedChange={(c) => {
                setEnabled(c)
                void save({ mcpEnabled: c })
              }}
            />
          }
        />
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.mcp.dynamicRegistration.label',
            defaultMessage: 'Dynamic client registration',
          })}
          htmlFor="dynamic-registration-toggle"
          description={intl.formatMessage({
            id: 'admin.settings.mcp.dynamicRegistration.description',
            defaultMessage:
              'Let new OAuth apps register themselves. Already-connected apps keep working when this is off.',
          })}
          control={
            <BusySwitch
              id="dynamic-registration-toggle"
              label={intl.formatMessage({
                id: 'admin.settings.mcp.dynamicRegistration.label',
                defaultMessage: 'Dynamic client registration',
              })}
              checked={dynamicRegistration}
              disabled={isBusy}
              busy={isBusy}
              onCheckedChange={(c) => {
                setDynamicRegistration(c)
                void save({ oauthDynamicClientRegistrationEnabled: c })
              }}
            />
          }
        />
      </SettingRows>
    </>
  )
}
