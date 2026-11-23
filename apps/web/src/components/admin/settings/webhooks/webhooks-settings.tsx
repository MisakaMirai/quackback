'use client'

import { useState } from 'react'
import { BoltIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/shared/empty-state'
import { NewButton } from '@/components/shared/new-button'
import { StateBadge, type BadgeState } from '@/components/shared/state-badge'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { RowIcon, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { getTimeAgo } from '@/components/ui/time-ago'
import { CreateWebhookDialog } from './create-webhook-dialog'
import { EditWebhookDialog } from './edit-webhook-dialog'
import { DeleteWebhookDialog } from './delete-webhook-dialog'
import type { Webhook } from '@/lib/shared/types'

const EVENT_MESSAGES: Record<string, { id: string; defaultMessage: string }> = {
  'post.created': { id: 'admin.webhooks.verify.events.newPost', defaultMessage: 'New post' },
  'post.status_changed': {
    id: 'admin.webhooks.verify.events.statusChanged',
    defaultMessage: 'Status changed',
  },
  'comment.created': {
    id: 'admin.webhooks.verify.events.newComment',
    defaultMessage: 'New comment',
  },
  'changelog.published': {
    id: 'admin.webhooks.verify.events.changelogPublished',
    defaultMessage: 'Changelog published',
  },
}

const WEBHOOK_LIMIT = 25

interface WebhooksSettingsProps {
  webhooks: Webhook[]
}

export function WebhooksSettings({ webhooks }: WebhooksSettingsProps) {
  const intl = useOptionalIntl()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null)
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null)

  const requestCreate = () => {
    setCreateDialogOpen(true)
  }

  /** The default (active, no failures) state shows no badge. */
  const getState = (webhook: Webhook): BadgeState | null => {
    if (webhook.status === 'disabled') return webhook.failureCount >= 50 ? 'error' : 'off'
    if (webhook.failureCount >= 25) return 'error'
    if (webhook.failureCount > 0) return 'attention'
    return null
  }

  /** Visible failure context, so it never hides in a tooltip. */
  const getFailureNote = (webhook: Webhook) => {
    if (webhook.status === 'disabled' && webhook.failureCount >= 50) {
      return intl.formatMessage(
        {
          id: 'admin.webhooks.list.autoDisabled',
          defaultMessage: 'Auto-disabled after {count} failures',
        },
        { count: webhook.failureCount }
      )
    }
    if (webhook.failureCount > 0) {
      return intl.formatMessage(
        {
          id: 'admin.webhooks.list.consecutiveFailures',
          defaultMessage:
            '{count, plural, one {# consecutive failure} other {# consecutive failures}}',
        },
        { count: webhook.failureCount }
      )
    }
    return null
  }

  const eventLabel = (event: string) => {
    const message = EVENT_MESSAGES[event]
    return message ? intl.formatMessage(message) : event
  }

  const atLimit = webhooks.length >= WEBHOOK_LIMIT
  const newWebhookButton = (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {atLimit && (
        <span className="text-[13px] text-muted-foreground">
          {intl.formatMessage(
            {
              id: 'admin.webhooks.list.limitReached',
              defaultMessage: 'Limit of {limit} webhooks reached',
            },
            { limit: WEBHOOK_LIMIT }
          )}
        </span>
      )}
      <NewButton noun="webhook" onClick={requestCreate} disabled={atLimit}>
        {intl.formatMessage({
          id: 'admin.webhooks.list.new',
          defaultMessage: 'New webhook',
        })}
      </NewButton>
    </div>
  )

  return (
    <>
      <SettingsCard
        title={intl.formatMessage({
          id: 'admin.webhooks.list.title',
          defaultMessage: 'Webhooks',
        })}
        description={intl.formatMessage({
          id: 'admin.webhooks.list.description',
          defaultMessage: 'Receive an HTTP POST when events happen in your workspace.',
        })}
        action={newWebhookButton}
        flush
      >
        {webhooks.length === 0 ? (
          <EmptyState
            size="compact"
            icon={BoltIcon}
            title={intl.formatMessage({
              id: 'admin.webhooks.list.emptyTitle',
              defaultMessage: 'No webhooks yet',
            })}
            description={intl.formatMessage({
              id: 'admin.webhooks.list.emptyDescription',
              defaultMessage:
                'Get notified when posts are created, statuses change or comments arrive.',
            })}
          />
        ) : (
          <SettingsList>
            {webhooks.map((webhook) => (
              <SettingsListRow
                key={webhook.id}
                leading={<RowIcon icon={BoltIcon} />}
                title={webhook.url}
                badges={getState(webhook) && <StateBadge state={getState(webhook)!} />}
                meta={
                  <>
                    {getFailureNote(webhook) && (
                      <span className="text-destructive">{getFailureNote(webhook)}</span>
                    )}
                    {getFailureNote(webhook) && ' · '}
                    {webhook.lastError && webhook.failureCount > 0 ? (
                      <span className="text-destructive" title={webhook.lastError}>
                        {intl.formatMessage(
                          {
                            id: 'admin.webhooks.list.lastError',
                            defaultMessage: 'Error: {error}',
                          },
                          { error: webhook.lastError }
                        )}
                      </span>
                    ) : (
                      <>
                        {webhook.events.map((e) => eventLabel(e)).join(', ')}
                        {webhook.lastTriggeredAt &&
                          ` · ${intl.formatMessage(
                            {
                              id: 'admin.webhooks.list.lastFired',
                              defaultMessage: 'Last fired {time}',
                            },
                            { time: getTimeAgo(webhook.lastTriggeredAt, intl.locale) }
                          )}`}
                      </>
                    )}
                  </>
                }
                actions={[
                  {
                    label: intl.formatMessage({
                      id: 'admin.webhooks.list.edit',
                      defaultMessage: 'Edit',
                    }),
                    onSelect: () => setEditWebhook(webhook),
                  },
                  {
                    label: intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' }),
                    destructive: true,
                    onSelect: () => setDeleteWebhook(webhook),
                  },
                ]}
              />
            ))}
          </SettingsList>
        )}
      </SettingsCard>

      {/* Dialogs */}
      <CreateWebhookDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {editWebhook && (
        <EditWebhookDialog
          webhook={editWebhook}
          open={!!editWebhook}
          onOpenChange={(open) => !open && setEditWebhook(null)}
        />
      )}

      {deleteWebhook && (
        <DeleteWebhookDialog
          webhook={deleteWebhook}
          open={!!deleteWebhook}
          onOpenChange={(open) => !open && setDeleteWebhook(null)}
        />
      )}
    </>
  )
}
