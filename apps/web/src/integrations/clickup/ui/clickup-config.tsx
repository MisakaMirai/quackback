'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon, FolderIcon } from '@heroicons/react/24/solid'
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
import { fetchExternalStatusesFn } from '@/lib/server/functions/external-statuses'
import {
  StatusSyncConfig,
  type ExternalStatus,
} from '@/components/admin/settings/integrations/status-sync-config'
import { TicketStatusSyncConfig } from '@/components/admin/settings/integrations/ticket-status-sync-config'
import { OnDeleteConfig } from '@/components/admin/settings/integrations/on-delete-config'
import {
  fetchClickUpSpacesFn,
  fetchClickUpListsFn,
  type ClickUpSpace,
  type ClickUpList,
} from '@/integrations/clickup/server/functions'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface ClickUpConfigProps {
  integrationId: string
  initialConfig: Record<string, unknown>
  initialEventMappings: EventMapping[]
  enabled: boolean
}

const EVENT_CONFIG = [
  {
    id: 'post.created' as const,
    label: {
      id: 'admin.integrations.config.eventCreateTask',
      defaultMessage: 'Create task from new feedback',
    },
    description: {
      id: 'admin.integrations.clickup.eventCreateTaskDescription',
      defaultMessage: 'Automatically create a ClickUp task when new feedback is submitted',
    },
  },
]

export function ClickUpConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  enabled,
}: ClickUpConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()

  const [spaces, setSpaces] = useState<ClickUpSpace[]>([])
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [spaceError, setSpaceError] = useState<string | null>(null)
  const [selectedSpace, setSelectedSpace] = useState((initialConfig.teamId as string) || '')

  const [lists, setLists] = useState<ClickUpList[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedList, setSelectedList] = useState((initialConfig.channelId as string) || '')

  const [externalStatuses, setExternalStatuses] = useState<ExternalStatus[]>([])
  const [integrationEnabled, setIntegrationEnabled] = useState(enabled)
  const [eventSettings, setEventSettings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      EVENT_CONFIG.map((event) => [
        event.id,
        initialEventMappings.find((m) => m.eventType === event.id)?.enabled ?? false,
      ])
    )
  )

  const fetchSpaces = useCallback(async () => {
    setLoadingSpaces(true)
    setSpaceError(null)
    try {
      const result = await fetchClickUpSpacesFn()
      setSpaces(result)
    } catch {
      setSpaceError(
        intl.formatMessage({
          id: 'admin.integrations.config.loadSpacesFailed',
          defaultMessage: 'Failed to load spaces. Please try again.',
        })
      )
    } finally {
      setLoadingSpaces(false)
    }
  }, [intl])

  const fetchLists = useCallback(
    async (spaceId: string) => {
      setLoadingLists(true)
      setListError(null)
      try {
        const result = await fetchClickUpListsFn({ data: { spaceId } })
        setLists(result)
      } catch {
        setListError(
          intl.formatMessage({
            id: 'admin.integrations.config.loadListsFailed',
            defaultMessage: 'Failed to load lists. Please try again.',
          })
        )
      } finally {
        setLoadingLists(false)
      }
    },
    [intl]
  )

  useEffect(() => {
    fetchSpaces()
    fetchExternalStatusesFn({ data: { integrationType: 'clickup' } })
      .then(setExternalStatuses)
      .catch(() => {})
  }, [fetchSpaces])

  useEffect(() => {
    if (selectedSpace) {
      fetchLists(selectedSpace)
    }
  }, [selectedSpace, fetchLists])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const handleSpaceChange = (spaceId: string) => {
    setSelectedSpace(spaceId)
    setSelectedList('')
    setLists([])
    updateMutation.mutate({ id: integrationId, config: { teamId: spaceId, channelId: '' } })
  }

  const handleListChange = (listId: string) => {
    setSelectedList(listId)
    updateMutation.mutate({
      id: integrationId,
      config: { teamId: selectedSpace, channelId: listId },
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
              id: 'admin.integrations.config.enabled',
              defaultMessage: 'Integration enabled',
            })}
          </Label>
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.integrations.clickup.disableHint',
              defaultMessage: 'Turn off to pause all ClickUp task syncing',
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
          <Label htmlFor="space-select">
            {intl.formatMessage({
              id: 'admin.integrations.config.space',
              defaultMessage: 'Space',
            })}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchSpaces}
            disabled={loadingSpaces}
            className="h-8 gap-1.5 text-xs"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingSpaces ? 'animate-spin' : ''}`} />
            {intl.formatMessage({
              id: 'admin.integrations.config.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        </div>
        {spaceError ? (
          <p className="text-sm text-destructive">{spaceError}</p>
        ) : (
          <Select
            value={selectedSpace}
            onValueChange={handleSpaceChange}
            disabled={loadingSpaces || saving || !integrationEnabled}
          >
            <SelectTrigger id="space-select" className="w-full">
              {loadingSpaces ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingSpaces',
                      defaultMessage: 'Loading spaces...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.integrations.config.selectSpace',
                    defaultMessage: 'Select a space',
                  })}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  <div className="flex items-center gap-2">
                    <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{space.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.clickup.spaceHint',
            defaultMessage: 'Select the space that contains the list for new feedback tasks.',
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="list-select">
          {intl.formatMessage({
            id: 'admin.integrations.config.list',
            defaultMessage: 'List',
          })}
        </Label>
        {listError ? (
          <p className="text-sm text-destructive">{listError}</p>
        ) : (
          <Select
            value={selectedList}
            onValueChange={handleListChange}
            disabled={!selectedSpace || loadingLists || saving || !integrationEnabled}
          >
            <SelectTrigger id="list-select" className="w-full">
              {loadingLists ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingLists',
                      defaultMessage: 'Loading lists...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={
                    selectedSpace
                      ? intl.formatMessage({
                          id: 'admin.integrations.config.selectList',
                          defaultMessage: 'Select a list',
                        })
                      : intl.formatMessage({
                          id: 'admin.integrations.config.selectSpaceFirst',
                          defaultMessage: 'Select a space first',
                        })
                  }
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.clickup.listHint',
            defaultMessage: 'New feedback tasks will be created in this list.',
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
            id: 'admin.integrations.config.chooseEventsTaskCreation',
            defaultMessage: 'Choose which events trigger task creation',
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

      <StatusSyncConfig
        integrationId={integrationId}
        integrationType="clickup"
        config={initialConfig}
        enabled={integrationEnabled}
        externalStatuses={externalStatuses}
      />

      <TicketStatusSyncConfig
        integrationId={integrationId}
        config={initialConfig}
        enabled={integrationEnabled}
        externalStatuses={externalStatuses}
      />

      <OnDeleteConfig
        integrationId={integrationId}
        integrationType="clickup"
        config={initialConfig}
        enabled={integrationEnabled}
      />
    </div>
  )
}
