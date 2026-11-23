import { useState } from 'react'
import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { connectAzureDevOpsFn } from '@/integrations/azure-devops/server/functions'
import { useDeleteIntegration } from '@/lib/client/mutations'
import { errorText } from '@/lib/client/error-text'

interface AzureDevOpsConnectionActionsProps {
  integrationId?: string
  isConnected: boolean
}

export function AzureDevOpsConnectionActions({
  integrationId,
  isConnected,
}: AzureDevOpsConnectionActionsProps) {
  const intl = useOptionalIntl()
  const deleteMutation = useDeleteIntegration()
  const [organizationUrl, setOrganizationUrl] = useState('')
  const [pat, setPat] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)

  const handleConnect = async () => {
    if (!organizationUrl.trim() || !pat.trim()) return

    setSaving(true)
    setError(null)
    setShowSuccess(false)
    try {
      await connectAzureDevOpsFn({
        data: { organizationUrl: organizationUrl.trim(), pat: pat.trim() },
      })
      setShowSuccess(true)
      setPat('')
      const timer = setTimeout(() => setShowSuccess(false), 3000)
      return () => clearTimeout(timer)
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.integrations.azureDevops.connectFailed',
            defaultMessage: 'Failed to connect to Azure DevOps',
          })
        )
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = () => {
    if (!integrationId) return
    deleteMutation.mutate({ id: integrationId })
  }

  const disconnecting = deleteMutation.isPending

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disconnecting}
          onClick={() => setDisconnectDialogOpen(true)}
        >
          {disconnecting ? (
            <>
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
              {intl.formatMessage({
                id: 'admin.integrations.connection.disconnecting',
                defaultMessage: 'Disconnecting...',
              })}
            </>
          ) : (
            intl.formatMessage({
              id: 'admin.integrations.connection.disconnect',
              defaultMessage: 'Disconnect',
            })
          )}
        </Button>
        <ConfirmDialog
          open={disconnectDialogOpen}
          onOpenChange={setDisconnectDialogOpen}
          title={intl.formatMessage(
            {
              id: 'admin.integrations.connection.disconnectTitle',
              defaultMessage: 'Disconnect {name}?',
            },
            { name: 'Azure DevOps' }
          )}
          description={intl.formatMessage({
            id: 'admin.integrations.azureDevops.disconnectDescription',
            defaultMessage:
              'This will remove the Azure DevOps integration and stop creating work items from feedback. You can reconnect at any time.',
          })}
          confirmLabel={intl.formatMessage({
            id: 'admin.integrations.connection.disconnect',
            defaultMessage: 'Disconnect',
          })}
          isPending={disconnecting}
          onConfirm={handleDisconnect}
        />
      </div>
    )
  }

  return (
    <>
      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircleIcon className="h-4 w-4" />
          <span>
            {intl.formatMessage({
              id: 'admin.integrations.azureDevops.connected',
              defaultMessage: 'Connected to Azure DevOps!',
            })}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ExclamationCircleIcon className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-url" className="text-sm">
            {intl.formatMessage({
              id: 'admin.integrations.azureDevops.organizationUrlLabel',
              defaultMessage: 'Organization URL',
            })}
          </Label>
          <Input
            id="org-url"
            type="url"
            placeholder="https://dev.azure.com/your-org"
            value={organizationUrl}
            onChange={(e) => setOrganizationUrl(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pat" className="text-sm">
            {intl.formatMessage({
              id: 'admin.integrations.azureDevops.patLabel',
              defaultMessage: 'Personal Access Token',
            })}
          </Label>
          <Input
            id="pat"
            type="password"
            placeholder={intl.formatMessage({
              id: 'admin.integrations.azureDevops.patPlaceholder',
              defaultMessage: 'Enter your PAT',
            })}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            disabled={saving}
          />
        </div>
        <Button
          onClick={handleConnect}
          disabled={saving || !organizationUrl.trim() || !pat.trim()}
          className="self-end"
        >
          {saving ? (
            <>
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
              {intl.formatMessage({
                id: 'admin.integrations.connection.connecting',
                defaultMessage: 'Connecting...',
              })}
            </>
          ) : (
            intl.formatMessage({
              id: 'admin.integrations.connection.connect',
              defaultMessage: 'Connect',
            })
          )}
        </Button>
      </div>
    </>
  )
}
