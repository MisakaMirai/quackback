'use client'

import { useState, useTransition, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SettingRow } from '@/components/admin/settings/setting-row'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateWebhookFn } from '@/lib/server/functions/webhooks'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { CopyButton } from '@/components/shared/copy-button'
import { WarningBox } from '@/components/shared/warning-box'
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_CONFIG } from '@/lib/shared/webhook-events'
import { RotateWebhookSecretDialog } from './rotate-webhook-secret-dialog'
import type { Webhook } from '@/lib/shared/types'
import { errorText } from '@/lib/client/error-text'

interface EditWebhookDialogProps {
  webhook: Webhook
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Drops event ids no longer offered, so a removed event never blocks saving. */
function knownEvents(events: string[]): string[] {
  const known = new Set<string>(WEBHOOK_EVENTS)
  return events.filter((event) => known.has(event))
}

export function EditWebhookDialog({ webhook, open, onOpenChange }: EditWebhookDialogProps) {
  const intl = useOptionalIntl()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [url, setUrl] = useState(webhook.url)
  const [selectedEvents, setSelectedEvents] = useState<string[]>(() => knownEvents(webhook.events))
  const [isEnabled, setIsEnabled] = useState(webhook.status === 'active')
  const [error, setError] = useState<string | null>(null)

  // Rotate secret state
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  // Reset form when webhook changes
  useEffect(() => {
    setUrl(webhook.url)
    setSelectedEvents(knownEvents(webhook.events))
    setIsEnabled(webhook.status === 'active')
    setError(null)
    setNewSecret(null)
  }, [webhook])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (selectedEvents.length === 0) {
      setError(
        intl.formatMessage({
          id: 'admin.webhooks.selectEventError',
          defaultMessage: 'Select at least one event',
        })
      )
      return
    }

    try {
      await updateWebhookFn({
        data: {
          webhookId: webhook.id,
          url,
          events: selectedEvents as (typeof WEBHOOK_EVENTS)[number][],
          status: isEnabled ? 'active' : 'disabled',
        },
      })

      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] })
        router.invalidate()
      })

      onOpenChange(false)
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.webhooks.edit.failed',
            defaultMessage: 'Failed to update webhook',
          })
        )
      )
    }
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    )
  }

  const handleSecretRotated = (secret: string) => {
    setNewSecret(secret)
  }

  const wasAutoDisabled = webhook.status === 'disabled' && webhook.failureCount >= 50

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({
                id: 'admin.webhooks.edit.title',
                defaultMessage: 'Edit webhook',
              })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({
                id: 'admin.webhooks.edit.description',
                defaultMessage: 'Update webhook configuration.',
              })}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-url">
                  {intl.formatMessage({
                    id: 'admin.webhooks.endpointUrl',
                    defaultMessage: 'Endpoint URL',
                  })}
                </Label>
                <Input
                  id="edit-url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {intl.formatMessage({
                    id: 'admin.webhooks.events',
                    defaultMessage: 'Events',
                  })}
                </Label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_CONFIG.map((event) => (
                    <label
                      key={event.id}
                      className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedEvents.includes(event.id)}
                        onCheckedChange={() => toggleEvent(event.id)}
                        disabled={isPending}
                        className="mt-0.5"
                        aria-label={intl.formatMessage(
                          {
                            id: 'admin.webhooks.subscribeToEventsAria',
                            defaultMessage: 'Subscribe to {event} events',
                          },
                          { event: event.label }
                        )}
                        data-in-label
                      />
                      <div>
                        <p className="text-sm font-medium">{event.label}</p>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <SettingRow
                label={intl.formatMessage({
                  id: 'admin.webhooks.edit.sendEvents',
                  defaultMessage: 'Send events',
                })}
                htmlFor="webhook-enabled"
                description={
                  wasAutoDisabled
                    ? intl.formatMessage({
                        id: 'admin.webhooks.edit.resetsFailureCount',
                        defaultMessage: 'Turning this on resets the failure count',
                      })
                    : intl.formatMessage({
                        id: 'admin.webhooks.edit.offDescription',
                        defaultMessage: 'When off, the webhook receives no events',
                      })
                }
                control={
                  <Switch
                    id="webhook-enabled"
                    checked={isEnabled}
                    onCheckedChange={setIsEnabled}
                    disabled={isPending}
                  />
                }
              />

              {wasAutoDisabled && (
                <WarningBox
                  variant="warning"
                  title={intl.formatMessage(
                    {
                      id: 'admin.webhooks.edit.autoDisabledTitle',
                      defaultMessage: 'Auto-disabled after {count} failures',
                    },
                    { count: webhook.failureCount }
                  )}
                  description={
                    webhook.lastError
                      ? intl.formatMessage(
                          {
                            id: 'admin.webhooks.edit.lastError',
                            defaultMessage: 'Last error: {error}',
                          },
                          { error: webhook.lastError }
                        )
                      : undefined
                  }
                />
              )}

              {/* Rotate secret section */}
              <div className="space-y-2">
                <Label>
                  {intl.formatMessage({
                    id: 'admin.webhooks.signingSecret',
                    defaultMessage: 'Signing secret',
                  })}
                </Label>
                {newSecret ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3">
                      <code className="ph-mask flex-1 text-sm font-mono break-all">
                        {newSecret}
                      </code>
                      <CopyButton
                        value={newSecret}
                        variant="ghost"
                        size="sm"
                        aria-label={intl.formatMessage({
                          id: 'admin.webhooks.edit.copySecretAria',
                          defaultMessage: 'Copy secret to clipboard',
                        })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {intl.formatMessage({
                        id: 'admin.webhooks.edit.secretSaveNote',
                        defaultMessage: "Save this secret now. It won't be shown again.",
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      {intl.formatMessage({
                        id: 'admin.webhooks.edit.rotateHint',
                        defaultMessage: 'Rotate to generate a new signing secret',
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRotateDialogOpen(true)}
                      disabled={isPending}
                    >
                      <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                      {intl.formatMessage({
                        id: 'admin.webhooks.rotateSecret',
                        defaultMessage: 'Rotate secret',
                      })}
                    </Button>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={isPending || !url || selectedEvents.length === 0}>
                {isPending
                  ? intl.formatMessage({
                      id: 'admin.webhooks.edit.saving',
                      defaultMessage: 'Saving...',
                    })
                  : intl.formatMessage({
                      id: 'admin.webhooks.edit.saveChanges',
                      defaultMessage: 'Save changes',
                    })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RotateWebhookSecretDialog
        webhook={webhook}
        open={rotateDialogOpen}
        onOpenChange={setRotateDialogOpen}
        onSecretRotated={handleSecretRotated}
      />
    </>
  )
}
