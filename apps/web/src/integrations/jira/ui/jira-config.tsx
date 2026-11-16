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
  fetchJiraProjectsFn,
  fetchJiraIssueTypesFn,
  type JiraProject,
  type JiraIssueType,
} from '@/integrations/jira/server/functions'

interface EventMapping {
  id: string
  eventType: string
  enabled: boolean
}

interface JiraConfigProps {
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
      id: 'admin.integrations.jira.eventCreateIssueDescription',
      defaultMessage: 'Automatically create a Jira issue when new feedback is submitted',
    },
  },
]

function parseChannelId(channelId?: string): { projectId: string; issueTypeId: string } {
  if (!channelId || !channelId.includes(':')) {
    return { projectId: '', issueTypeId: '' }
  }
  const [projectId, issueTypeId] = channelId.split(':')
  return { projectId, issueTypeId }
}

export function JiraConfig({
  integrationId,
  initialConfig,
  initialEventMappings,
  enabled,
}: JiraConfigProps) {
  const intl = useOptionalIntl()
  const updateMutation = useUpdateIntegration()

  const { projectId: initialProjectId, issueTypeId: initialIssueTypeId } = parseChannelId(
    (initialConfig.channelId as string) || ''
  )

  const [projects, setProjects] = useState<JiraProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState(initialProjectId)

  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([])
  const [loadingIssueTypes, setLoadingIssueTypes] = useState(false)
  const [issueTypeError, setIssueTypeError] = useState<string | null>(null)
  const [selectedIssueType, setSelectedIssueType] = useState(initialIssueTypeId)

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

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true)
    setProjectError(null)
    try {
      const result = await fetchJiraProjectsFn()
      setProjects(result)
    } catch {
      setProjectError(
        intl.formatMessage({
          id: 'admin.integrations.config.loadProjectsFailed',
          defaultMessage: 'Failed to load projects. Please try again.',
        })
      )
    } finally {
      setLoadingProjects(false)
    }
  }, [intl])

  const fetchIssueTypes = useCallback(
    async (projectId: string) => {
      setLoadingIssueTypes(true)
      setIssueTypeError(null)
      try {
        const result = await fetchJiraIssueTypesFn({ data: { projectId } })
        setIssueTypes(result.filter((t: JiraIssueType) => !t.subtask))
      } catch {
        setIssueTypeError(
          intl.formatMessage({
            id: 'admin.integrations.config.loadIssueTypesFailed',
            defaultMessage: 'Failed to load issue types. Please try again.',
          })
        )
      } finally {
        setLoadingIssueTypes(false)
      }
    },
    [intl]
  )

  useEffect(() => {
    fetchProjects()
    fetchExternalStatusesFn({ data: { integrationType: 'jira' } })
      .then(setExternalStatuses)
      .catch(() => {})
  }, [fetchProjects])

  useEffect(() => {
    if (selectedProject) {
      fetchIssueTypes(selectedProject)
    }
  }, [selectedProject, fetchIssueTypes])

  const handleEnabledChange = (checked: boolean) => {
    setIntegrationEnabled(checked)
    updateMutation.mutate({ id: integrationId, enabled: checked })
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId)
    setSelectedIssueType('')
    setIssueTypes([])
  }

  const handleIssueTypeChange = (issueTypeId: string) => {
    setSelectedIssueType(issueTypeId)
    const channelId = `${selectedProject}:${issueTypeId}`
    updateMutation.mutate({ id: integrationId, config: { channelId } })
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
              id: 'admin.integrations.jira.disableHint',
              defaultMessage: 'Turn off to pause all Jira issue syncing',
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
          <Label htmlFor="project-select">
            {intl.formatMessage({
              id: 'admin.integrations.config.project',
              defaultMessage: 'Project',
            })}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchProjects}
            disabled={loadingProjects}
            className="h-8 gap-1.5 text-xs"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingProjects ? 'animate-spin' : ''}`} />
            {intl.formatMessage({
              id: 'admin.integrations.config.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        </div>
        {projectError ? (
          <p className="text-sm text-destructive">{projectError}</p>
        ) : (
          <Select
            value={selectedProject}
            onValueChange={handleProjectChange}
            disabled={loadingProjects || saving || !integrationEnabled}
          >
            <SelectTrigger id="project-select" className="w-full">
              {loadingProjects ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingProjects',
                      defaultMessage: 'Loading projects...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.integrations.config.selectProject',
                    defaultMessage: 'Select a project',
                  })}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>
                      {project.key} - {project.name}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.jira.projectHint',
            defaultMessage: 'New feedback issues will be created in this project.',
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="issue-type-select">
          {intl.formatMessage({
            id: 'admin.integrations.config.issueType',
            defaultMessage: 'Issue type',
          })}
        </Label>
        {issueTypeError ? (
          <p className="text-sm text-destructive">{issueTypeError}</p>
        ) : (
          <Select
            value={selectedIssueType}
            onValueChange={handleIssueTypeChange}
            disabled={!selectedProject || loadingIssueTypes || saving || !integrationEnabled}
          >
            <SelectTrigger id="issue-type-select" className="w-full">
              {loadingIssueTypes ? (
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>
                    {intl.formatMessage({
                      id: 'admin.integrations.config.loadingIssueTypes',
                      defaultMessage: 'Loading issue types...',
                    })}
                  </span>
                </div>
              ) : (
                <SelectValue
                  placeholder={
                    selectedProject
                      ? intl.formatMessage({
                          id: 'admin.integrations.config.selectIssueType',
                          defaultMessage: 'Select an issue type',
                        })
                      : intl.formatMessage({
                          id: 'admin.integrations.config.selectProjectFirst',
                          defaultMessage: 'Select a project first',
                        })
                  }
                />
              )}
            </SelectTrigger>
            <SelectContent>
              {issueTypes.map((issueType) => (
                <SelectItem key={issueType.id} value={issueType.id}>
                  {issueType.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.integrations.jira.issueTypeHint',
            defaultMessage: 'The issue type used when creating new issues from feedback.',
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
            id: 'admin.integrations.config.chooseEventsIssueCreation',
            defaultMessage: 'Choose which events trigger issue creation',
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
        integrationType="jira"
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
        integrationType="jira"
        config={initialConfig}
        enabled={integrationEnabled}
      />
    </div>
  )
}
