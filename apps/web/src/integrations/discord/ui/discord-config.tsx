import { useMemo, useState } from 'react'
import { ArrowPathIcon, HashtagIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import type { IntlShape } from 'react-intl'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useUpdateIntegration } from '@/lib/client/mutations'
import { adminQueries } from '@/lib/client/queries/admin'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDiscordChannelsFn,
  type DiscordChannel,
} from '@/integrations/discord/server/functions'
import {
  NotificationChannelRouter,
  type NotificationChannel,
  type EventConfig,
} from '@/components/admin/settings/integrations/shared/notification-channel-router'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface DiscordConfigProps {
  integrationId: string
  initialConfig: { channelId?: string }
  initialEventMappings: EventMapping[]
  notificationChannels?: NotificationChannel[]
  enabled: boolean
}

function discordEventConfig(intl: IntlShape): EventConfig[] {
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
  ]
}

function useDiscordChannels(intl: IntlShape) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['discord-channels'],
    queryFn: () => fetchDiscordChannelsFn(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['discord-channels'] })
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

export function DiscordConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  notificationChannels: initialChannels,
  enabled,
}: DiscordConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const {
    channels,
    loading: loadingChannels,
    error: channelError,
    refresh: refreshChannels,
  } = useDiscordChannels(intl)
  const boardsQuery = useQuery(adminQueries.boards())
  const boards = useMemo(
    () => (boardsQuery.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    [boardsQuery.data]
  )
  const [integrationEnabled, setIntegrationEnabled] = useState(enabled)
  const events = useMemo(() => discordEventConfig(intl), [intl])

  // Use notificationChannels if provided; otherwise synthesize from legacy
  // single-channel config so the user can keep editing without re-adding.
  const notificationChannels = useMemo<NotificationChannel[]>(() => {
    if (initialChannels?.length) return initialChannels
    if (!initialConfig.channelId) return []
    return [
      {
        channelId: initialConfig.channelId,
        events: events.map((e) => ({
          eventType: e.id,
          enabled: initialEventMappings.find((m) => m.eventType === e.id)?.enabled ?? false,
        })),
        boardIds: null,
      },
    ]
  }, [initialChannels, initialConfig.channelId, initialEventMappings, events])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const saving = updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="enabled-toggle" className="text-base font-medium">
            {intl.formatMessage({
              id: 'admin.integrations.config.notificationsEnabled',
              defaultMessage: 'Notifications enabled',
            })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.integrations.discord.disableHint',
              defaultMessage: 'Turn off to pause all Discord notifications',
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
              id: 'admin.integrations.discord.routingHint',
              defaultMessage: 'Choose which events reach each Discord channel',
            })}
          </p>
        </div>

        <NotificationChannelRouter<DiscordChannel>
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
