'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  FolderIcon,
  ChevronRightIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/solid'
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
import { Badge } from '@/components/ui/badge'
import { MENU_LABEL } from '@/components/ui/menu'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useUpdateIntegration } from '@/lib/client/mutations'
import {
  fetchGitHubReposFn,
  getGitHubChannelStatusFn,
  type GitHubRepo,
} from '@/integrations/github/server/functions'
import { StatusSyncConfig } from '@/components/admin/settings/integrations/status-sync-config'
import { TicketStatusSyncConfig } from '@/components/admin/settings/integrations/ticket-status-sync-config'
import { OnDeleteConfig } from '@/components/admin/settings/integrations/on-delete-config'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface GitHubConfigProps {
  integrationId: string
  initialConfig: Record<string, unknown>
  initialEventMappings: EventMapping[]
  enabled: boolean
}

const EVENT_CONFIG = [
  {
    id: 'post.created' as const,
    label: {
      id: 'admin.integrations.config.eventCreateIssue',
      defaultMessage: 'Create issue from new feedback',
    },
    description: {
      id: 'admin.integrations.github.eventCreateIssueDescription',
      defaultMessage: 'Automatically create a GitHub issue when new feedback is submitted.',
    },
  },
]

const GITHUB_STATUSES = [
  { id: 'Open', name: 'Open' },
  { id: 'Closed', name: 'Closed' },
]

export function GitHubConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  enabled,
}: GitHubConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState((initialConfig.channelId as string) || '')
  const [integrationEnabled, setIntegrationEnabled] = useState(enabled)
  const [eventSettings, setEventSettings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      EVENT_CONFIG.map((event) => [
        event.id,
        initialEventMappings.find((m) => m.eventType === event.id)?.enabled ?? false,
      ])
    )
  )
  const inboxQuery = useQuery({
    queryKey: ['settings', 'github-channel-status'],
    queryFn: () => getGitHubChannelStatusFn(),
    staleTime: 60_000,
  })

  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true)
    setRepoError(null)
    try {
      const result = await fetchGitHubReposFn()
      setRepos(result)
    } catch {
      setRepoError(
        intl.formatMessage({
          id: 'admin.integrations.config.loadRepositoriesFailed',
          defaultMessage: 'Failed to load repositories. Please try again.',
        })
      )
    } finally {
      setLoadingRepos(false)
    }
  }, [intl])

  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const handleRepoChange = (ownerRepo: string) => {
    setSelectedRepo(ownerRepo)
    updateMutation.mutate({ id: integrationId, config: { channelId: ownerRepo } })
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
  const inbox = inboxQuery.data
  const inboxAttention = !!inbox?.connected && (!!inbox.lastError || inbox.status !== 'active')
  const inboxBadge = !inbox?.connected
    ? {
        label: intl.formatMessage({
          id: 'admin.integrations.github.badgeSetUp',
          defaultMessage: 'Set up',
        }),
        variant: 'secondary' as const,
      }
    : inboxAttention
      ? {
          label: intl.formatMessage({
            id: 'admin.integrations.github.badgeAttention',
            defaultMessage: 'Attention',
          }),
          variant: 'destructive' as const,
        }
      : inbox.inboxEnabled
        ? {
            label: intl.formatMessage({ id: 'common.state.on', defaultMessage: 'On' }),
            variant: 'default' as const,
          }
        : {
            label: intl.formatMessage({ id: 'common.state.off', defaultMessage: 'Off' }),
            variant: 'secondary' as const,
          }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border/50 px-6 py-4">
          <h2 className="text-base font-semibold">
            {intl.formatMessage({
              id: 'admin.integrations.github.connection',
              defaultMessage: 'Connection',
            })}
          </h2>
        </div>
        <div className="space-y-6 p-6">
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
                  id: 'admin.integrations.github.disableHint',
                  defaultMessage: 'Turn off to pause all GitHub issue syncing',
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
              <Label htmlFor="repo-select">
                {intl.formatMessage({
                  id: 'admin.integrations.config.repository',
                  defaultMessage: 'Repository',
                })}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchRepos}
                disabled={loadingRepos}
                className="h-8 gap-1.5 text-xs"
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingRepos ? 'animate-spin' : ''}`} />
                {intl.formatMessage({
                  id: 'admin.integrations.config.refresh',
                  defaultMessage: 'Refresh',
                })}
              </Button>
            </div>
            {repoError ? (
              <p className="text-sm text-destructive">{repoError}</p>
            ) : (
              <Select
                value={selectedRepo}
                onValueChange={handleRepoChange}
                disabled={loadingRepos || saving || !integrationEnabled}
              >
                <SelectTrigger id="repo-select" className="w-full">
                  {loadingRepos ? (
                    <div className="flex items-center gap-2">
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      <span>
                        {intl.formatMessage({
                          id: 'admin.integrations.config.loadingRepositories',
                          defaultMessage: 'Loading repositories...',
                        })}
                      </span>
                    </div>
                  ) : (
                    <SelectValue
                      placeholder={intl.formatMessage({
                        id: 'admin.integrations.config.selectRepository',
                        defaultMessage: 'Select a repository',
                      })}
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.fullName}>
                      <div className="flex items-center gap-2">
                        <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{repo.fullName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.integrations.github.repositoryHint',
                defaultMessage: 'New feedback issues will be created in this repository.',
              })}
            </p>
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
      </section>

      <div className="space-y-2">
        <span className={MENU_LABEL}>
          {intl.formatMessage({
            id: 'admin.integrations.github.sectionFeedback',
            defaultMessage: 'Feedback',
          })}
        </span>
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {EVENT_CONFIG.map((event, i) => (
            <div
              key={event.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <div className="pr-4">
                <p className="text-sm font-medium">{intl.formatMessage(event.label)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {intl.formatMessage(event.description)}
                </p>
              </div>
              <Switch
                checked={eventSettings[event.id] ?? false}
                onCheckedChange={(checked) => handleEventToggle(event.id, checked)}
                disabled={saving || !integrationEnabled}
              />
            </div>
          ))}
          <div className="border-t border-border px-4 py-4">
            <StatusSyncConfig
              integrationId={integrationId}
              integrationType="github"
              config={initialConfig}
              enabled={integrationEnabled}
              externalStatuses={GITHUB_STATUSES}
            />
            <OnDeleteConfig
              integrationId={integrationId}
              integrationType="github"
              config={initialConfig}
              enabled={integrationEnabled}
            />
          </div>
        </section>
      </div>

      <div className="space-y-2">
        <span className={MENU_LABEL}>
          {intl.formatMessage({
            id: 'admin.integrations.github.sectionSupport',
            defaultMessage: 'Support',
          })}
        </span>
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <Link
            to="/admin/settings/channels/github"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ChatBubbleLeftRightIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {intl.formatMessage({
                    id: 'admin.integrations.github.inboxChannel',
                    defaultMessage: 'Inbox channel',
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {intl.formatMessage({
                    id: 'admin.integrations.github.inboxChannelDescription',
                    defaultMessage: 'Issues and comments as conversations. Managed in Channels.',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge size="sm" variant={inboxBadge.variant}>
                {inboxBadge.label}
              </Badge>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
            </div>
          </Link>
          <div className="border-t border-border px-4 py-4">
            <p className="mb-3 text-sm font-medium">
              {intl.formatMessage({
                id: 'admin.integrations.github.syncTicketStatuses',
                defaultMessage: 'Sync ticket statuses',
              })}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.integrations.github.syncTicketStatusesHint',
                defaultMessage: 'Update linked issues when ticket status changes.',
              })}
            </p>
            <TicketStatusSyncConfig
              integrationId={integrationId}
              config={initialConfig}
              enabled={integrationEnabled}
              externalStatuses={GITHUB_STATUSES}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
