'use client'

import { useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { SecretRevealDialog } from '@/components/shared/secret-reveal-dialog'
import { Button } from '@/components/ui/button'
import { CheckboxGroup } from '@/components/ui/checkbox-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createWebhookFn } from '@/lib/server/functions/webhooks'
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_CONFIG } from '@/lib/shared/webhook-events'
import { errorText } from '@/lib/client/error-text'

interface CreateWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWebhookDialog({ open, onOpenChange }: CreateWebhookDialogProps) {
  const intl = useOptionalIntl()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Secret reveal state
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

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
      const result = await createWebhookFn({
        data: {
          url,
          events: selectedEvents as (typeof WEBHOOK_EVENTS)[number][],
        },
      })

      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] })
        router.invalidate()
      })

      // Show secret reveal
      setCreatedSecret(result.secret)
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.webhooks.create.failed',
            defaultMessage: 'Failed to create webhook',
          })
        )
      )
    }
  }

  const handleClose = () => {
    setUrl('')
    setSelectedEvents([])
    setError(null)
    setCreatedSecret(null)
    onOpenChange(false)
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    )
  }

  // Secret reveal view
  if (createdSecret) {
    return (
      <SecretRevealDialog
        open={open}
        onOpenChange={handleClose}
        title={intl.formatMessage({
          id: 'admin.webhooks.create.secretTitle',
          defaultMessage: 'Webhook created',
        })}
        description={intl.formatMessage({
          id: 'admin.webhooks.create.secretDescription',
          defaultMessage: "Save your signing secret now. You won't be able to see it again.",
        })}
        secretLabel={intl.formatMessage({
          id: 'admin.webhooks.signingSecret',
          defaultMessage: 'Signing secret',
        })}
        secretValue={createdSecret}
        confirmLabel={intl.formatMessage({
          id: 'admin.webhooks.create.secretConfirm',
          defaultMessage: "I've saved my secret",
        })}
      >
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>
              {intl.formatMessage({
                id: 'admin.webhooks.create.verificationLabel',
                defaultMessage: 'Verification:',
              })}
            </strong>{' '}
            {intl.formatMessage(
              {
                id: 'admin.webhooks.create.signatureHeader',
                defaultMessage:
                  'Each webhook includes an <code>X-Quackback-Signature</code> header.',
              },
              { code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }
            )}
          </p>
          <p>
            {intl.formatMessage(
              {
                id: 'admin.webhooks.create.hmacNote',
                defaultMessage:
                  'Compute <code>HMAC-SHA256(timestamp.payload, secret)</code> and compare with the signature.',
              },
              { code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }
            )}
          </p>
        </div>
      </SecretRevealDialog>
    )
  }

  // Create form view
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.webhooks.create.title',
              defaultMessage: 'Create webhook',
            })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: 'admin.webhooks.create.description',
              defaultMessage: 'Configure an endpoint to receive event notifications.',
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="url">
                {intl.formatMessage({
                  id: 'admin.webhooks.endpointUrl',
                  defaultMessage: 'Endpoint URL',
                })}
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: 'admin.webhooks.create.httpsNote',
                  defaultMessage: 'Must be HTTPS in production',
                })}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {intl.formatMessage({
                  id: 'admin.webhooks.events',
                  defaultMessage: 'Events',
                })}
              </Label>
              <CheckboxGroup
                className="space-y-2"
                items={WEBHOOK_EVENT_CONFIG.map((event) => ({
                  value: event.id,
                  label: event.label,
                  description: event.description,
                  ariaLabel: intl.formatMessage(
                    {
                      id: 'admin.webhooks.subscribeToEventsAria',
                      defaultMessage: 'Subscribe to {event} events',
                    },
                    { event: event.label }
                  ),
                }))}
                selected={selectedEvents}
                onToggle={toggleEvent}
                disabled={isPending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={isPending || !url || selectedEvents.length === 0}>
              {isPending
                ? intl.formatMessage({
                    id: 'admin.webhooks.create.creating',
                    defaultMessage: 'Creating...',
                  })
                : intl.formatMessage({
                    id: 'admin.webhooks.create.title',
                    defaultMessage: 'Create webhook',
                  })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
