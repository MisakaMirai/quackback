import { missingSlackScopes } from '../scopes'
import { useMemo, useState } from 'react'
import { ArrowPathIcon, HashtagIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import type { IntlShape } from 'react-intl'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useUpdateIntegration } from '@/lib/client/mutations'
import { adminQueries } from '@/lib/client/queries/admin'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSlackChannelsFn, type SlackChannel } from '@/integrations/slack/server/functions'
import {
  NotificationChannelRouter,
  type EventConfig,
  type NotificationChannel,
} from '@/components/admin/settings/integrations/shared/notification-channel-router'

// ============================================
// Types
// ============================================

interface SlackConfigProps {
  integrationId: string
  initialConfig: { channelId?: string; scopes?: string }
  initialEventMappings: { id: string; eventType: string; enabled: boolean }[]
  notificationChannels?: NotificationChannel[]
  enabled: boolean
}

// ============================================
// Constants
// ============================================

function slackEventConfig(intl: IntlShape): EventConfig[] {
  return [
    {
      id: 'post.created',
      label: intl.formatMessage({
        id: 'admin.integrations.config.eventNewPost',
        defaultMessage: 'New post submitted',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.config.eventNewPostShort',
        defaultMessage: 'New post',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.config.eventNewPostDescription',
        defaultMessage: 'When someone submits a new post',
      }),
    },
    {
      id: 'post.status_changed',
      label: intl.formatMessage({
        id: 'admin.integrations.config.eventPostStatusChanged',
        defaultMessage: 'Post status changed',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.config.eventPostStatusChangedShort',
        defaultMessage: 'Status',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.config.eventPostStatusChangedDescription',
        defaultMessage: "When a post's status is updated",
      }),
    },
    {
      id: 'comment.created',
      label: intl.formatMessage({
        id: 'admin.integrations.config.eventNewCommentPosted',
        defaultMessage: 'New comment posted',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.config.eventNewCommentPostedShort',
        defaultMessage: 'Comment',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.config.eventNewCommentPostedDescription',
        defaultMessage: 'When someone comments on a post',
      }),
    },
    {
      id: 'changelog.published',
      label: intl.formatMessage({
        id: 'admin.integrations.slack.eventChangelogPublished',
        defaultMessage: 'Changelog published',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.slack.eventChangelogPublishedShort',
        defaultMessage: 'Changelog',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.slack.eventChangelogPublishedDescription',
        defaultMessage: 'When a changelog entry is published',
      }),
    },
    {
      id: 'conversation.created',
      label: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewConversation',
        defaultMessage: 'New support conversation',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewConversationShort',
        defaultMessage: 'Conversation',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewConversationDescription',
        defaultMessage: 'When a visitor starts a support conversation',
      }),
    },
    {
      id: 'message.created',
      label: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewSupportMessage',
        defaultMessage: 'New support message',
      }),
      shortLabel: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewSupportMessageShort',
        defaultMessage: 'Support msg',
      }),
      description: intl.formatMessage({
        id: 'admin.integrations.slack.eventNewSupportMessageDescription',
        defaultMessage: 'When a visitor sends a support message (agent replies are not sent)',
      }),
    },
  ]
}

// ============================================
// Helpers
// ============================================

function useSlackChannels(intl: IntlShape) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['slack-channels'],
    queryFn: () => fetchSlackChannelsFn({ data: { force: false } }),
    staleTime: 5 * 60 * 1000, // 5 minutes — matches the server-side cache TTL
    retry: 1,
  })

  const refresh = () => {
    queryClient.fetchQuery({
      queryKey: ['slack-channels'],
      queryFn: () => fetchSlackChannelsFn({ data: { force: true } }),
    })
  }

  return {
    channels: query.data ?? [],
    loading: query.isLoading || query.isFetching,
    error: query.isError
      ? intl.formatMessage({
          id: 'admin.integrations.config.loadChannelsFailed',
          defaultMessage: 'Failed to load channels. Please try again.',
        })
      : null,
    refresh,
  }
}

// ============================================
// Main Component
// ============================================

export function SlackConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  notificationChannels: initialChannels,
  enabled,
}: SlackConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const {
    channels,
    loading: loadingChannels,
    error: channelError,
    refresh: refreshChannels,
  } = useSlackChannels(intl)
  const boardsQuery = useQuery(adminQueries.boards())
  const boards = (boardsQuery.data ?? []).map((b) => ({ id: b.id, name: b.name }))
  const [integrationEnabled, setIntegrationEnabled] = useState(enabled)
  const events = useMemo(() => slackEventConfig(intl), [intl])

  // Use notificationChannels if available, otherwise fall back to legacy single-channel
  const notificationChannels: NotificationChannel[] = initialChannels?.length
    ? initialChannels
    : initialConfig.channelId
      ? [
          {
            channelId: initialConfig.channelId,
            events: events.map((e) => ({
              eventType: e.id,
              enabled: initialEventMappings.find((m) => m.eventType === e.id)?.enabled ?? false,
            })),
            boardIds: null,
          },
        ]
      : []

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const saving = updateMutation.isPending

  return (
    <div className="space-y-6">
      {missingSlackScopes(initialConfig.scopes).length > 0 && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">
            {intl.formatMessage({
              id: 'admin.integrations.slack.reconnectTitle',
              defaultMessage: 'Reconnect to enable @Quackback',
            })}
          </p>
          <p className="text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.integrations.slack.reconnectDescription',
              defaultMessage:
                'Grant the new Slack permissions to use the integration. Your notifications keep working.',
            })}
          </p>
          <a className="underline" href="/oauth/slack/connect">
            {intl.formatMessage({
              id: 'admin.integrations.slack.reconnect',
              defaultMessage: 'Reconnect Slack',
            })}
          </a>
        </div>
      )}
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="enabled-toggle" className="text-base font-medium">
            {intl.formatMessage({
              id: 'admin.integrations.config.enabled',
              defaultMessage: 'Integration enabled',
            })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.integrations.slack.disableHint',
              defaultMessage: 'Turn off to pause all Slack features',
            })}
          </p>
        </div>
        <Switch
          id="enabled-toggle"
          checked={integrationEnabled}
          onCheckedChange={handleEnabledChange}
          disabled={saving}
        />
      </div>

      <div className="border-t border-border/30" />

      {/* Notification Routing */}
      <div className="space-y-3">
        <div>
          <Label className="text-base font-medium">
            {intl.formatMessage({
              id: 'admin.integrations.config.notificationRouting',
              defaultMessage: 'Notification routing',
            })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.integrations.slack.routingHint',
              defaultMessage: 'Choose which events reach each Slack channel',
            })}
          </p>
        </div>

        <NotificationChannelRouter<SlackChannel>
          integrationId={integrationId}
          enabled={integrationEnabled}
          events={events}
          channels={channels}
          notificationChannels={notificationChannels}
          boards={boards}
          loadingChannels={loadingChannels}
          channelError={channelError}
          onRefreshChannels={refreshChannels}
          renderChannelIcon={(channel) => {
            const Icon = channel?.isPrivate ? LockClosedIcon : HashtagIcon
            return <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          }}
        />
      </div>

      {/* Saving indicator (for enable/disable toggle) */}
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

      {/* Error message */}
      {updateMutation.isError && (
        <div className="text-sm text-destructive">
          {updateMutation.error?.message ||
            intl.formatMessage({
              id: 'admin.integrations.config.saveFailed',
              defaultMessage: 'Failed to save changes',
            })}
        </div>
      )}
    </div>
  )
}
