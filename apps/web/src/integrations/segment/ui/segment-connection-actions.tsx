import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useDeleteIntegration } from '@/lib/client/mutations'
import { saveSegmentConnectionFn } from '@/lib/server/functions/segment-integration'
import { errorText } from '@/lib/client/error-text'

export function SegmentConnectionActions(props: { integrationId?: string; isConnected: boolean }) {
  const intl = useOptionalIntl()
  const [incomingSecret, setIncomingSecret] = useState('')
  const [writeKey, setWriteKey] = useState('')
  const [outgoingEnabled, setOutgoingEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deleteMutation = useDeleteIntegration()

  if (props.isConnected) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          {intl.formatMessage({
            id: 'admin.integrations.connection.disconnect',
            defaultMessage: 'Disconnect',
          })}
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={intl.formatMessage(
            {
              id: 'admin.integrations.connection.disconnectTitle',
              defaultMessage: 'Disconnect {name}?',
            },
            { name: 'Segment' }
          )}
          description={intl.formatMessage({
            id: 'admin.integrations.segment.disconnectDescription',
            defaultMessage:
              'Inbound identify events and outbound membership sync will stop immediately.',
          })}
          confirmLabel={intl.formatMessage({
            id: 'admin.integrations.connection.disconnect',
            defaultMessage: 'Disconnect',
          })}
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            if (props.integrationId) deleteMutation.mutate({ id: props.integrationId })
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="segment-incoming-secret">
          {intl.formatMessage({
            id: 'admin.integrations.segment.incomingSecretLabel',
            defaultMessage: 'Inbound signing secret',
          })}
        </Label>
        <Input
          id="segment-incoming-secret"
          type="password"
          autoComplete="new-password"
          value={incomingSecret}
          onChange={(event) => setIncomingSecret(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="segment-write-key">
          {intl.formatMessage({
            id: 'admin.integrations.segment.writeKeyLabel',
            defaultMessage: 'Source write key (optional)',
          })}
        </Label>
        <Input
          id="segment-write-key"
          type="password"
          autoComplete="new-password"
          value={writeKey}
          onChange={(event) => setWriteKey(event.target.value)}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox
          checked={outgoingEnabled}
          onCheckedChange={(checked) => setOutgoingEnabled(checked === true)}
          data-in-label
        />
        {intl.formatMessage({
          id: 'admin.integrations.segment.outgoingLabel',
          defaultMessage: 'Push segment membership changes back to Segment',
        })}
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        disabled={saving || incomingSecret.trim().length < 16}
        onClick={async () => {
          setSaving(true)
          setError(null)
          try {
            await saveSegmentConnectionFn({
              data: {
                incomingSecret: incomingSecret.trim(),
                writeKey: writeKey.trim() || undefined,
                outgoingEnabled,
              },
            })
            window.location.reload()
          } catch (cause) {
            setError(
              errorText(
                cause,
                intl.formatMessage({
                  id: 'admin.integrations.segment.connectFailed',
                  defaultMessage: 'Failed to connect Segment',
                })
              )
            )
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving
          ? intl.formatMessage({
              id: 'admin.integrations.config.saving',
              defaultMessage: 'Saving...',
            })
          : intl.formatMessage({
              id: 'admin.integrations.segment.connectLabel',
              defaultMessage: 'Connect Segment',
            })}
      </Button>
    </div>
  )
}
