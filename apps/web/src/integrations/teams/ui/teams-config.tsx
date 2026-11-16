import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon, HashtagIcon } from '@heroicons/react/24/solid'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useUpdateIntegration } from '@/lib/client/mutations'
import {
  fetchTeamsTeamsFn,
  fetchTeamsChannelsFn,
  type TeamsTeam,
  type TeamsChannel,
} from '@/integrations/teams/server/functions'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface TeamsConfigProps {
  integrationId: string
  initialConfig: { channelId?: string; teamId?: string }
  initialEventMappings: EventMapping[]
  enabled: boolean
}

const EVENT_CONFIG = [
  {
    id: 'post.created' as const,
    label: {
      id: 'admin.integrations.config.eventNewFeedback',
      defaultMessage: 'New feedback submitted',
    },
    description: {
      id: 'admin.integrations.teams.eventNewFeedbackDescription',
      defaultMessage: 'When a user submits new feedback',
    },
  },
  {
    id: 'post.status_changed' as const,
    label: {
      id: 'admin.integrations.config.eventStatusChanged',
      defaultMessage: 'Feedback status changed',
    },
    description: {
      id: 'admin.integrations.teams.eventStatusChangedDescription',
      defaultMessage: 'When the status of a feedback post is updated',
    },
  },
  {
    id: 'comment.created' as const,
    label: {
      id: 'admin.integrations.config.eventNewComment',
      defaultMessage: 'New comment on feedback',
    },
    description: {
      id: 'admin.integrations.teams.eventNewCommentDescription',
      defaultMessage: 'When someone comments on a feedback post',
    },
  },
]

export function TeamsConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  enabled,
}: TeamsConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const [teams, setTeams] = useState<TeamsTeam[]>([])
  const [channels, setChannels] = useState<TeamsChannel[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState(initialConfig.teamId || '')
  const [selectedChannel, setSelectedChannel] = useState(initialConfig.channelId || '')
  const [integrationEnabled, setIntegrationEnabled] = useState(enabled)
  const [eventSettings, setEventSettings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      EVENT_CONFIG.map((event) => [
        event.id,
        initialEventMappings.find((m) => m.eventType === event.id)?.enabled ?? false,
      ])
    )
  )

  const fetchTeams = useCallback(async () => {
    setLoadingTeams(true)
    setTeamError(null)
    try {
      const result = await fetchTeamsTeamsFn()
      setTeams(result)
    } catch {
      setTeamError(
        intl.formatMessage({
          id: 'admin.integrations.config.loadTeamsFailed',
          defaultMessage: 'Failed to load teams. Please try again.',
        })
      )
    } finally {
      setLoadingTeams(false)
    }
  }, [intl])

  const fetchChannels = useCallback(
    async (teamId: string) => {
      setLoadingChannels(true)
      setChannelError(null)
      try {
        const result = await fetchTeamsChannelsFn({ data: { teamId } })
        setChannels(result)
      } catch {
        setChannelError(
          intl.formatMessage({
            id: 'admin.integrations.config.loadChannelsFailed',
            defaultMessage: 'Failed to load channels. Please try again.',
          })
        )
      } finally {
        setLoadingChannels(false)
      }
    },
    [intl]
  )

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  useEffect(() => {
    if (selectedTeam) {
      fetchChannels(selectedTeam)
    }
  }, [selectedTeam, fetchChannels])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const handleTeamChange = (teamId: string) => {
    setSelectedTeam(teamId)
    setSelectedChannel('')
    setChannels([])
    updateMutation.mutate({
      id: integrationId,
      config: { teamId, channelId: '' },
    })
  }

  const handleChannelChange = (channelId: string) => {
    setSelectedChannel(channelId)
    updateMutation.mutate({
      id: integrationId,
      config: { teamId: selectedTeam, channelId },
    })
  }

  const handleEventToggle = (eventId: string, checked: boolean) => {
    const newSettings = { ...eventSettings, [eventId]: checked }
    setEventSettings(newSettings)
    updateMutation.mutate({
      id: integrationId,
      eventMappings: Object.entries(newSettings).map(([eventType, enabled]) => ({
        eventType,
        enabled,
      })),
    })
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
              id: 'admin.integrations.teams.disableHint',
              defaultMessage: 'Turn off to pause all Teams notifications',
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="team-select">
            {intl.formatMessage({
              id: 'admin.integrations.config.team',
              defaultMessage: 'Team',
            })}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTeams}
            disabled={loadingTeams}
            className="h-8 gap-1.5 text-xs"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingTeams ? 'animate-spin' : ''}`} />
            {intl.formatMessage({
              id: 'admin.integrations.config.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        </div>
        {teamError ? (
          <p className="text-sm text-destructive">{teamError}</p>
        ) : (
          <Select
            value={selectedTeam}
            onValueChange={handleTeamChange}
            disabled={loadingTeams || saving || !integrationEnabled}
          >
            <SelectTrigger id="team-select" className="w-full">
              {loadingTeams ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingTeams',
                      defaultMessage: 'Loading teams...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.integrations.config.selectTeam',
                    defaultMessage: 'Select a team',
                  })}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span>{team.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.teams.teamHint',
            defaultMessage: 'Select the Microsoft Teams team where notifications should be posted.',
          })}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="channel-select">
            {intl.formatMessage({
              id: 'admin.integrations.config.channel',
              defaultMessage: 'Channel',
            })}
          </Label>
          {selectedTeam && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchChannels(selectedTeam)}
              disabled={loadingChannels}
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingChannels ? 'animate-spin' : ''}`} />
              {intl.formatMessage({
                id: 'admin.integrations.config.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>
          )}
        </div>
        {channelError ? (
          <p className="text-sm text-destructive">{channelError}</p>
        ) : (
          <Select
            value={selectedChannel}
            onValueChange={handleChannelChange}
            disabled={!selectedTeam || loadingChannels || saving || !integrationEnabled}
          >
            <SelectTrigger id="channel-select" className="w-full">
              {loadingChannels ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingChannels',
                      defaultMessage: 'Loading channels...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={
                    selectedTeam
                      ? intl.formatMessage({
                          id: 'admin.integrations.config.selectChannel',
                          defaultMessage: 'Select a channel',
                        })
                      : intl.formatMessage({
                          id: 'admin.integrations.config.selectTeamFirst',
                          defaultMessage: 'Select a team first',
                        })
                  }
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {channels.map((channel) => (
                <SelectItem key={channel.id} value={channel.id}>
                  <div className="flex items-center gap-2">
                    <HashtagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{channel.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.teams.channelHint',
            defaultMessage:
              'The bot will post notifications to this channel. Make sure the bot has been added to your team.',
          })}
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-medium">
          {intl.formatMessage({
            id: 'admin.integrations.config.events',
            defaultMessage: 'Events',
          })}
        </Label>
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.config.chooseEventsNotifications',
            defaultMessage: 'Choose which events trigger notifications',
          })}
        </p>
        <div className="space-y-3 pt-2">
          {EVENT_CONFIG.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-lg border border-border/50 p-3"
            >
              <div>
                <div className="font-medium text-sm">{intl.formatMessage(event.label)}</div>
                <div className="text-xs text-muted-foreground">
                  {intl.formatMessage(event.description)}
                </div>
              </div>
              <Switch
                checked={eventSettings[event.id] ?? false}
                onCheckedChange={(checked) => handleEventToggle(event.id, checked)}
                disabled={saving || !integrationEnabled}
              />
            </div>
          ))}
        </div>
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
