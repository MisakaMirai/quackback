import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/solid'
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
import { OnDeleteConfig } from '@/components/admin/settings/integrations/on-delete-config'
import {
  StatusSyncConfig,
  type ExternalStatus,
} from '@/components/admin/settings/integrations/status-sync-config'
import { TicketStatusSyncConfig } from '@/components/admin/settings/integrations/ticket-status-sync-config'
import { fetchExternalStatusesFn } from '@/lib/server/functions/external-statuses'
import {
  fetchTrelloBoardsFn,
  fetchTrelloListsFn,
  type TrelloBoard,
  type TrelloList,
} from '@/integrations/trello/server/functions'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface TrelloConfigProps {
  integrationId: string
  initialConfig: { channelId?: string; boardId?: string }
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
      id: 'admin.integrations.trello.eventNewFeedbackDescription',
      defaultMessage: 'Create a Trello card when a user submits new feedback',
    },
  },
]

export function TrelloConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  enabled,
}: TrelloConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [lists, setLists] = useState<TrelloList[]>([])
  const [loadingBoards, setLoadingBoards] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedBoard, setSelectedBoard] = useState(initialConfig.boardId || '')
  const [selectedList, setSelectedList] = useState(initialConfig.channelId || '')
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

  const fetchBoards = useCallback(async () => {
    setLoadingBoards(true)
    setBoardError(null)
    try {
      const result = await fetchTrelloBoardsFn()
      setBoards(result)
    } catch {
      setBoardError(
        intl.formatMessage({
          id: 'admin.integrations.config.loadBoardsFailed',
          defaultMessage: 'Failed to load boards. Please try again.',
        })
      )
    } finally {
      setLoadingBoards(false)
    }
  }, [intl])

  const fetchLists = useCallback(
    async (boardId: string) => {
      setLoadingLists(true)
      setListError(null)
      try {
        const result = await fetchTrelloListsFn({ data: { boardId } })
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

  const fetchStatuses = useCallback(async () => {
    try {
      const statuses = await fetchExternalStatusesFn({ data: { integrationType: 'trello' } })
      setExternalStatuses(statuses)
    } catch {
      // Non-critical — status mapping just won't show options
    }
  }, [])

  useEffect(() => {
    fetchBoards()
    fetchStatuses()
  }, [fetchBoards, fetchStatuses])

  useEffect(() => {
    if (selectedBoard) {
      fetchLists(selectedBoard)
    } else {
      setLists([])
      setSelectedList('')
    }
  }, [selectedBoard, fetchLists])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const handleBoardChange = (boardId: string) => {
    setSelectedBoard(boardId)
    setSelectedList('')
    updateMutation.mutate({ id: integrationId, config: { boardId, channelId: '' } })
  }

  const handleListChange = (listId: string) => {
    setSelectedList(listId)
    updateMutation.mutate({
      id: integrationId,
      config: { boardId: selectedBoard, channelId: listId },
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
              id: 'admin.integrations.trello.disableHint',
              defaultMessage: 'Turn off to pause card creation in Trello',
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
          <Label htmlFor="board-select">
            {intl.formatMessage({
              id: 'admin.integrations.trello.boardLabel',
              defaultMessage: 'Trello board',
            })}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchBoards}
            disabled={loadingBoards}
            className="h-8 gap-1.5 text-xs"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingBoards ? 'animate-spin' : ''}`} />
            {intl.formatMessage({
              id: 'admin.integrations.config.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        </div>
        {boardError ? (
          <p className="text-sm text-destructive">{boardError}</p>
        ) : (
          <Select
            value={selectedBoard}
            onValueChange={handleBoardChange}
            disabled={loadingBoards || saving || !integrationEnabled}
          >
            <SelectTrigger id="board-select" className="w-full">
              {loadingBoards ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingBoards',
                      defaultMessage: 'Loading boards...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.integrations.config.selectBoard',
                    defaultMessage: 'Select a board',
                  })}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.trello.boardHint',
            defaultMessage: 'Choose which Trello board cards should be created in',
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="list-select">
          {intl.formatMessage({
            id: 'admin.integrations.trello.listLabel',
            defaultMessage: 'Trello list',
          })}
        </Label>
        {listError ? (
          <p className="text-sm text-destructive">{listError}</p>
        ) : (
          <Select
            value={selectedList}
            onValueChange={handleListChange}
            disabled={loadingLists || saving || !integrationEnabled || !selectedBoard}
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
                    selectedBoard
                      ? intl.formatMessage({
                          id: 'admin.integrations.config.selectList',
                          defaultMessage: 'Select a list',
                        })
                      : intl.formatMessage({
                          id: 'admin.integrations.config.selectBoardFirst',
                          defaultMessage: 'Select a board first',
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
            id: 'admin.integrations.trello.listHint',
            defaultMessage: 'New feedback cards will be created in this list',
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
            id: 'admin.integrations.trello.chooseEvents',
            defaultMessage: 'Choose which events trigger card creation',
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
        integrationType="trello"
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
        integrationType="trello"
        config={initialConfig}
        enabled={integrationEnabled}
      />
    </div>
  )
}
