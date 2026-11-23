'use client'

import { useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { deleteWebhookFn } from '@/lib/server/functions/webhooks'
import type { Webhook } from '@/lib/shared/types'
import { errorText } from '@/lib/client/error-text'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'

interface DeleteWebhookDialogProps {
  webhook: Webhook
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteWebhookDialog({ webhook, open, onOpenChange }: DeleteWebhookDialogProps) {
  const intl = useOptionalIntl()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setError(null)

    try {
      await deleteWebhookFn({ data: { webhookId: webhook.id } })

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
            id: 'admin.webhooks.delete.failed',
            defaultMessage: 'Failed to delete webhook',
          })
        )
      )
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={intl.formatMessage({
        id: 'admin.webhooks.delete.title',
        defaultMessage: 'Delete webhook?',
      })}
      description={intl.formatMessage({
        id: 'admin.webhooks.delete.description',
        defaultMessage: 'Are you sure you want to delete this webhook?',
      })}
      warning={{
        title: intl.formatMessage({
          id: 'admin.webhooks.delete.warningTitle',
          defaultMessage: 'This action cannot be undone',
        }),
        description: (
          <>
            {intl.formatMessage(
              {
                id: 'admin.webhooks.delete.warningBody',
                defaultMessage:
                  'The webhook to {url} will be permanently deleted and will no longer receive events.',
              },
              {
                url: <code className="bg-muted px-1 rounded text-xs">{webhook.url}</code>,
              }
            )}
          </>
        ),
      }}
      variant="destructive"
      confirmLabel={
        isPending
          ? intl.formatMessage({
              id: 'admin.webhooks.delete.deleting',
              defaultMessage: 'Deleting...',
            })
          : intl.formatMessage({
              id: 'admin.webhooks.delete.confirm',
              defaultMessage: 'Delete webhook',
            })
      }
      isPending={isPending}
      onConfirm={handleDelete}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
    </ConfirmDialog>
  )
}
