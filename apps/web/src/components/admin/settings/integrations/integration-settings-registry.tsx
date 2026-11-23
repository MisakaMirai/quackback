/**
 * Integration settings registry (IF WO-6). ONE entry per provider drives the
 * single dynamic `$type` settings route, replacing 25 near-identical route
 * files. Each entry supplies only what varies per provider: catalog metadata,
 * brand icon, connect/disconnect actions, the not-connected setup copy, and
 * (when connected) a capability configuration panel. Everything
 * shared (the header, platform-credentials dialog, health panel, and setup
 * card chrome) lives in the route itself.
 *
 * Config panels and connection actions are `React.lazy` so opening one
 * provider's settings page never pulls the other 24 providers' panels into the
 * bundle. (Per-provider colocation of these entries into `<provider>/` happens
 * in WO-11.)
 */
import { lazy, type ComponentType, type ReactNode } from 'react'
import type { IntlShape, MessageDescriptor } from 'react-intl'
import { CustomerContextConfig } from './shared/customer-context-config'
import type { IntegrationCatalogEntry } from '@/lib/shared/integration-types'
import type { NotificationChannel } from '@/components/admin/settings/integrations/shared/notification-channel-router'
import type { IntegrationHealth } from './integration-health-panel'
import { getIntegrationIcon } from './integration-ui'

// Catalogs (metadata: name/description/iconBg/docsUrl/platformCredentialFields/settingsPath).
import * as catalogs from '@/lib/shared/integration-catalog'
import { INLINE_LINK } from '@/components/admin/settings/inline-link'
import { NewTabHint } from '@/components/ui/button'

/** The `integration` object returned by `fetchIntegrationByType`. */
export interface IntegrationSettingsData {
  id: string
  status: 'active' | 'paused' | 'pending' | null
  workspaceName?: string | null
  config: Record<string, string | number | boolean | null>
  eventMappings: { id: string; eventType: string; enabled: boolean }[]
  notificationChannels?: NotificationChannel[]
  health?: IntegrationHealth
}

/** Uniform call shape for every `<Provider>ConnectionActions` component. */
export type ConnectionActionsComponent = ComponentType<{
  integrationId?: string
  isConnected: boolean
}>

/** Setup card copy shown before an integration is connected. */
export interface IntegrationSetup {
  title: MessageDescriptor
  description: MessageDescriptor
  /**
   * Built with the surrounding intl at render time (never at module scope), so
   * the copy follows the active locale. Rich tags (`<b>`, `<code>`, and
   * step-specific ones like `<link>`/`<endpoint>`) resolve through the values
   * passed to `intl.formatMessage`.
   */
  steps: (intl: IntlShape) => ReactNode[]
}

export interface IntegrationSettingsEntry {
  /** Registry/type id (underscore form, e.g. `azure_devops`). */
  type: string
  /** Catalog metadata. */
  catalog: IntegrationCatalogEntry
  /** Brand icon. */
  Icon: ComponentType<{ className?: string }>
  /** Connect / disconnect (or webhook / key) actions. */
  ConnectionActions: ConnectionActionsComponent
  /** Setup card copy shown when not connected. */
  setup: IntegrationSetup
  /** Connected-state capability configuration. */
  renderConfig?: (ctx: { integration: IntegrationSettingsData; isConnected: boolean }) => ReactNode
  /** Override the "Connected to X" workspace label (e.g. azure_devops → organizationName). */
  getWorkspaceName?: (integration: IntegrationSettingsData) => string | null | undefined
  /**
   * When true, the route skips the wrapping card and the shared health panel
   * so this config can own Connection / Health / product sections.
   */
  bareConfig?: boolean
  /**
   * The connect step needs typed input (a URL, key or token), so it renders in
   * the setup card rather than as a single header button.
   */
  connectForm?: boolean
}

// ── lazy per-provider components ────────────────────────────────────────────
// Config panels (connected state). Prop shapes differ per provider, so each is
// wired through its entry's renderConfig; the route wraps them in one Suspense.

const AsanaConfig = lazy(() =>
  import('@/integrations/asana/ui/asana-config').then((m) => ({ default: m.AsanaConfig }))
)
const AzureDevOpsConfig = lazy(() =>
  import('@/integrations/azure-devops/ui/azure-devops-config').then((m) => ({
    default: m.AzureDevOpsConfig,
  }))
)
const ClickUpConfig = lazy(() =>
  import('@/integrations/clickup/ui/clickup-config').then((m) => ({ default: m.ClickUpConfig }))
)
const DiscordConfig = lazy(() =>
  import('@/integrations/discord/ui/discord-config').then((m) => ({ default: m.DiscordConfig }))
)
const GitHubConfig = lazy(() =>
  import('@/integrations/github/ui/github-config').then((m) => ({ default: m.GitHubConfig }))
)
const GitLabConfig = lazy(() =>
  import('@/integrations/gitlab/ui/gitlab-config').then((m) => ({ default: m.GitLabConfig }))
)
const JiraConfig = lazy(() =>
  import('@/integrations/jira/ui/jira-config').then((m) => ({ default: m.JiraConfig }))
)
const LinearConfig = lazy(() =>
  import('@/integrations/linear/ui/linear-config').then((m) => ({ default: m.LinearConfig }))
)
const MakeConfig = lazy(() =>
  import('@/integrations/make/ui/make-config').then((m) => ({ default: m.MakeConfig }))
)
const MondayConfig = lazy(() =>
  import('@/integrations/monday/ui/monday-config').then((m) => ({ default: m.MondayConfig }))
)
const N8nConfig = lazy(() =>
  import('@/integrations/n8n/ui/n8n-config').then((m) => ({ default: m.N8nConfig }))
)
const NotionConfig = lazy(() =>
  import('@/integrations/notion/ui/notion-config').then((m) => ({ default: m.NotionConfig }))
)
const NtfyConfig = lazy(() =>
  import('@/integrations/ntfy/ui/ntfy-config').then((m) => ({ default: m.NtfyConfig }))
)
const ShortcutConfig = lazy(() =>
  import('@/integrations/shortcut/ui/shortcut-config').then((m) => ({ default: m.ShortcutConfig }))
)
const SlackConfig = lazy(() =>
  import('@/integrations/slack/ui/slack-config').then((m) => ({ default: m.SlackConfig }))
)
const TeamsConfig = lazy(() =>
  import('@/integrations/teams/ui/teams-config').then((m) => ({ default: m.TeamsConfig }))
)
const TrelloConfig = lazy(() =>
  import('@/integrations/trello/ui/trello-config').then((m) => ({ default: m.TrelloConfig }))
)
const ZapierConfig = lazy(() =>
  import('@/integrations/zapier/ui/zapier-config').then((m) => ({ default: m.ZapierConfig }))
)

// Connection-actions (uniform {integrationId?, isConnected} shape).
const AsanaConnectionActions = lazy(() =>
  import('@/integrations/asana/ui/asana-connection-actions').then((m) => ({
    default: m.AsanaConnectionActions,
  }))
)
const AzureDevOpsConnectionActions = lazy(() =>
  import('@/integrations/azure-devops/ui/azure-devops-connection-actions').then((m) => ({
    default: m.AzureDevOpsConnectionActions,
  }))
)
const ClickUpConnectionActions = lazy(() =>
  import('@/integrations/clickup/ui/clickup-connection-actions').then((m) => ({
    default: m.ClickUpConnectionActions,
  }))
)
const DiscordConnectionActions = lazy(() =>
  import('@/integrations/discord/ui/discord-connection-actions').then((m) => ({
    default: m.DiscordConnectionActions,
  }))
)
const FreshdeskConnectionActions = lazy(() =>
  import('@/integrations/freshdesk/ui/freshdesk-connection-actions').then((m) => ({
    default: m.FreshdeskConnectionActions,
  }))
)
const GitHubConnectionActions = lazy(() =>
  import('@/integrations/github/ui/github-connection-actions').then((m) => ({
    default: m.GitHubConnectionActions,
  }))
)
const GitLabConnectionActions = lazy(() =>
  import('@/integrations/gitlab/ui/gitlab-connection-actions').then((m) => ({
    default: m.GitLabConnectionActions,
  }))
)
const HubSpotConnectionActions = lazy(() =>
  import('@/integrations/hubspot/ui/hubspot-connection-actions').then((m) => ({
    default: m.HubSpotConnectionActions,
  }))
)
const IntercomConnectionActions = lazy(() =>
  import('@/integrations/intercom/ui/intercom-connection-actions').then((m) => ({
    default: m.IntercomConnectionActions,
  }))
)
const JiraConnectionActions = lazy(() =>
  import('@/integrations/jira/ui/jira-connection-actions').then((m) => ({
    default: m.JiraConnectionActions,
  }))
)
const LinearConnectionActions = lazy(() =>
  import('@/integrations/linear/ui/linear-connection-actions').then((m) => ({
    default: m.LinearConnectionActions,
  }))
)
const MakeConnectionActions = lazy(() =>
  import('@/integrations/make/ui/make-connection-actions').then((m) => ({
    default: m.MakeConnectionActions,
  }))
)
const MondayConnectionActions = lazy(() =>
  import('@/integrations/monday/ui/monday-connection-actions').then((m) => ({
    default: m.MondayConnectionActions,
  }))
)
const N8nConnectionActions = lazy(() =>
  import('@/integrations/n8n/ui/n8n-connection-actions').then((m) => ({
    default: m.N8nConnectionActions,
  }))
)
const NotionConnectionActions = lazy(() =>
  import('@/integrations/notion/ui/notion-connection-actions').then((m) => ({
    default: m.NotionConnectionActions,
  }))
)
const NtfyConnectionActions = lazy(() =>
  import('@/integrations/ntfy/ui/ntfy-connection-actions').then((m) => ({
    default: m.NtfyConnectionActions,
  }))
)
const SalesforceConnectionActions = lazy(() =>
  import('@/integrations/salesforce/ui/salesforce-connection-actions').then((m) => ({
    default: m.SalesforceConnectionActions,
  }))
)
const SegmentConnectionActions = lazy(() =>
  import('@/integrations/segment/ui/segment-connection-actions').then((m) => ({
    default: m.SegmentConnectionActions,
  }))
)
const ShortcutConnectionActions = lazy(() =>
  import('@/integrations/shortcut/ui/shortcut-connection-actions').then((m) => ({
    default: m.ShortcutConnectionActions,
  }))
)
const SlackConnectionActions = lazy(() =>
  import('@/integrations/slack/ui/slack-connection-actions').then((m) => ({
    default: m.SlackConnectionActions,
  }))
)
const StripeConnectionActions = lazy(() =>
  import('@/integrations/stripe/ui/stripe-connection-actions').then((m) => ({
    default: m.StripeConnectionActions,
  }))
)
const TeamsConnectionActions = lazy(() =>
  import('@/integrations/teams/ui/teams-connection-actions').then((m) => ({
    default: m.TeamsConnectionActions,
  }))
)
const TrelloConnectionActions = lazy(() =>
  import('@/integrations/trello/ui/trello-connection-actions').then((m) => ({
    default: m.TrelloConnectionActions,
  }))
)
const ZapierConnectionActions = lazy(() =>
  import('@/integrations/zapier/ui/zapier-connection-actions').then((m) => ({
    default: m.ZapierConnectionActions,
  }))
)

/** Segment has no icon registered in `INTEGRATION_UI` (it isn't a tracker or a
 * feedback source badge) - its route renders an inline "S" glyph instead of a
 * brand icon component. We keep that glyph here as a component so it fits the
 * `Icon: ComponentType<{ className?: string }>` shape the rest of the registry
 * expects. */
function SegmentIcon({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      S
    </span>
  )
}

/** Rich-text values for setup steps: `<b>` emphasis and inline `<code>`. */
const RICH_TEXT = {
  b: (chunks: ReactNode) => <span className="font-medium text-foreground">{chunks}</span>,
  code: (chunks: ReactNode) => <code className="text-xs">{chunks}</code>,
}

// Step copy shared by every provider that uses the same workflow wording.
const CHOOSE_EVENTS_TASK: MessageDescriptor = {
  id: 'admin.integrations.setup.chooseEventsTask',
  defaultMessage:
    'Choose which events trigger task creation. You can change these settings at any time.',
}
const CHOOSE_EVENTS_ISSUE: MessageDescriptor = {
  id: 'admin.integrations.setup.chooseEventsIssue',
  defaultMessage:
    'Choose which events trigger issue creation. You can change these settings at any time.',
}
const CHOOSE_EVENTS_NOTIFICATION: MessageDescriptor = {
  id: 'admin.integrations.setup.chooseEventsNotification',
  defaultMessage:
    'Choose which events trigger notifications. You can enable or disable individual event types at any time.',
}
const LOOKUP_BY_EMAIL: MessageDescriptor = {
  id: 'admin.integrations.setup.lookupByEmail',
  defaultMessage: 'Customer details are looked up by email when you open customer context.',
}

/** The registry, keyed by integration type (underscore form). */
export const INTEGRATION_SETTINGS: Record<string, IntegrationSettingsEntry> = {
  asana: {
    type: 'asana',
    catalog: catalogs.asanaCatalog,
    Icon: getIntegrationIcon('asana')!,
    ConnectionActions: AsanaConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.asana.title',
        defaultMessage: 'Connect your Asana workspace',
      },
      description: {
        id: 'admin.integrations.setup.asana.description',
        defaultMessage:
          'Connect Asana to create tasks from feedback and review incoming status changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.asana.step1',
              defaultMessage:
                'Click <b>Connect Asana</b> to authorize Quackback to create tasks in your Asana workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.asana.step2',
            defaultMessage: 'Select which project new feedback tasks should be created in.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_TASK)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <AsanaConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  azure_devops: {
    type: 'azure_devops',
    connectForm: true,
    catalog: catalogs.azureDevOpsCatalog,
    Icon: getIntegrationIcon('azure_devops')!,
    ConnectionActions: AzureDevOpsConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.azureDevOps.title',
        defaultMessage: 'Connect Azure DevOps',
      },
      description: {
        id: 'admin.integrations.setup.azureDevOps.description',
        defaultMessage:
          "Connect Azure DevOps to automatically create work items from feedback posts, keeping your team's workflow in sync.",
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.azureDevOps.step1',
              defaultMessage:
                'Create a <link>Personal access token</link> in Azure DevOps with <b>Work Items (Read & Write)</b> scope.',
            },
            {
              ...RICH_TEXT,
              link: (chunks: ReactNode) => (
                <a
                  href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={INLINE_LINK}
                >
                  {chunks}
                  <NewTabHint />
                </a>
              ),
            }
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.azureDevOps.step2',
              defaultMessage:
                'Enter your organization URL and PAT below, then click <b>Connect</b>. Quackback will verify access to your organization.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.azureDevOps.step3',
            defaultMessage:
              'Select which project and work item type to use, then enable the events that should trigger work item creation.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <AzureDevOpsConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
    getWorkspaceName: (integration) =>
      (integration.config.organizationName as string | undefined) ?? undefined,
  },

  clickup: {
    type: 'clickup',
    catalog: catalogs.clickupCatalog,
    Icon: getIntegrationIcon('clickup')!,
    ConnectionActions: ClickUpConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.clickup.title',
        defaultMessage: 'Connect your ClickUp workspace',
      },
      description: {
        id: 'admin.integrations.setup.clickup.description',
        defaultMessage:
          'Connect ClickUp to turn feedback into tasks and track progress directly from your workspace.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.clickup.step1',
              defaultMessage:
                'Click <b>Connect ClickUp</b> to authorize Quackback to create tasks in your ClickUp workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.clickup.step2',
            defaultMessage: 'Select a space and list where new feedback tasks should be created.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_TASK)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <ClickUpConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  discord: {
    type: 'discord',
    catalog: catalogs.discordCatalog,
    Icon: getIntegrationIcon('discord')!,
    ConnectionActions: DiscordConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.discord.title',
        defaultMessage: 'Connect your Discord server',
      },
      description: {
        id: 'admin.integrations.setup.discord.description',
        defaultMessage:
          'Connect Discord to receive notifications when users submit feedback, when statuses change, and when comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.discord.step1',
              defaultMessage:
                'Click <b>Connect Discord</b> to add the Quackback bot to your Discord server.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.discord.step2',
            defaultMessage:
              'Select which text channel notifications should be posted to. The bot needs access to the channel.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_NOTIFICATION)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <DiscordConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        notificationChannels={integration.notificationChannels}
        enabled={isConnected}
      />
    ),
  },

  freshdesk: {
    type: 'freshdesk',
    connectForm: true,
    catalog: catalogs.freshdeskCatalog,
    Icon: getIntegrationIcon('freshdesk')!,
    ConnectionActions: FreshdeskConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.freshdesk.title',
        defaultMessage: 'Connect Freshdesk',
      },
      description: {
        id: 'admin.integrations.setup.freshdesk.description',
        defaultMessage:
          'Connect Freshdesk to see contact details and open the customer’s Freshdesk profile.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.freshdesk.step1',
              defaultMessage: 'Find your <b>API key</b> in your Freshdesk profile settings.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.freshdesk.step2',
              defaultMessage:
                'Enter your Freshdesk subdomain and API key below, then click <b>Save</b>. Quackback will verify the connection.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>{intl.formatMessage(LOOKUP_BY_EMAIL)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <CustomerContextConfig integrationId={integration.id} enabled={isConnected} />
    ),
  },

  github: {
    type: 'github',
    catalog: catalogs.githubCatalog,
    Icon: getIntegrationIcon('github')!,
    ConnectionActions: GitHubConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.github.title',
        defaultMessage: 'Connect your GitHub account',
      },
      description: {
        id: 'admin.integrations.setup.github.description',
        defaultMessage:
          'Connect GitHub to automatically create issues from user feedback and sync statuses when issues are closed or reopened.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.github.step1',
              defaultMessage:
                'Click <b>Connect GitHub</b> to authorize Quackback to create issues in your GitHub repositories.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.github.step2',
            defaultMessage: 'Select which repository new feedback issues should be created in.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_ISSUE)}</p>,
      ],
    },
    bareConfig: true,
    renderConfig: ({ integration, isConnected }) => (
      <GitHubConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  gitlab: {
    type: 'gitlab',
    catalog: catalogs.gitlabCatalog,
    Icon: getIntegrationIcon('gitlab')!,
    ConnectionActions: GitLabConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.gitlab.title',
        defaultMessage: 'Connect GitLab',
      },
      description: {
        id: 'admin.integrations.setup.gitlab.description',
        defaultMessage:
          'Connect GitLab.com or a self-hosted GitLab instance to create issues from feedback and review incoming status changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.gitlab.step1',
              defaultMessage:
                'Configure your GitLab <b>Application ID and Secret</b>. For a self-hosted instance, also set the <b>GitLab instance URL</b>. Register the redirect URI shown in the credentials form on your GitLab OAuth application.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.gitlab.step2',
              defaultMessage:
                'Click <b>Connect GitLab</b> to authorize Quackback with your GitLab account. You will be sent to GitLab.com or your instance, depending on the URL you configured.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.gitlab.step3',
            defaultMessage:
              'Select a project to create issues in, then choose which events should trigger new issues.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <GitLabConfig
        integrationId={integration.id}
        initialConfig={(integration.config ?? {}) as { channelId?: string }}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  hubspot: {
    type: 'hubspot',
    catalog: catalogs.hubspotCatalog,
    Icon: getIntegrationIcon('hubspot')!,
    ConnectionActions: HubSpotConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.hubspot.title',
        defaultMessage: 'Connect your HubSpot account',
      },
      description: {
        id: 'admin.integrations.setup.hubspot.description',
        defaultMessage:
          'Connect HubSpot to enrich feedback with CRM context like company, deal value, and lifecycle stage.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.hubspot.step1',
            defaultMessage:
              'Connect your HubSpot account to authorize read-only access to contact and deal data.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.hubspot.step2',
            defaultMessage:
              'Open customer context to look up the customer’s HubSpot profile by email.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.hubspot.step3',
            defaultMessage:
              'CRM context (company, deal value, lifecycle stage) appears alongside their feedback to help you prioritize by revenue impact.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <CustomerContextConfig integrationId={integration.id} enabled={isConnected} />
    ),
  },

  intercom: {
    type: 'intercom',
    catalog: catalogs.intercomCatalog,
    Icon: getIntegrationIcon('intercom')!,
    ConnectionActions: IntercomConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.intercom.title',
        defaultMessage: 'Connect your Intercom account',
      },
      description: {
        id: 'admin.integrations.setup.intercom.description',
        defaultMessage:
          'Connect Intercom to enrich feedback with customer context like company, plan, and tags.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.intercom.step1',
            defaultMessage:
              'Connect your Intercom account to authorize read-only access to contact data.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.intercom.step2',
            defaultMessage:
              'Open customer context to look up the customer’s Intercom profile by email.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.intercom.step3',
            defaultMessage:
              'Customer context (company, plan, tags) appears alongside their feedback to help you prioritize.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <CustomerContextConfig integrationId={integration.id} enabled={isConnected} />
    ),
  },

  jira: {
    type: 'jira',
    catalog: catalogs.jiraCatalog,
    Icon: getIntegrationIcon('jira')!,
    ConnectionActions: JiraConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.jira.title',
        defaultMessage: 'Connect your Jira instance',
      },
      description: {
        id: 'admin.integrations.setup.jira.description',
        defaultMessage:
          'Connect Jira to create issues from feedback and review incoming status changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.jira.step1',
              defaultMessage:
                'Click <b>Connect Jira</b> to authorize Quackback to create issues in your Jira instance.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.jira.step2',
            defaultMessage: 'Select which project and issue type to use for new feedback issues.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_ISSUE)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <JiraConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  linear: {
    type: 'linear',
    catalog: catalogs.linearCatalog,
    Icon: getIntegrationIcon('linear')!,
    ConnectionActions: LinearConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.linear.title',
        defaultMessage: 'Connect your Linear workspace',
      },
      description: {
        id: 'admin.integrations.setup.linear.description',
        defaultMessage:
          'Connect Linear to create issues from feedback and receive verified status updates on linked items.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.linear.step1',
              defaultMessage:
                'Click <b>Connect Linear</b> to authorize Quackback to create issues in your Linear workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.linear.step2',
            defaultMessage: 'Select which team new feedback issues should be created in.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_ISSUE)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <LinearConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  make: {
    type: 'make',
    connectForm: true,
    catalog: catalogs.makeCatalog,
    Icon: getIntegrationIcon('make')!,
    ConnectionActions: MakeConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.make.title',
        defaultMessage: 'Connect Make',
      },
      description: {
        id: 'admin.integrations.setup.make.description',
        defaultMessage:
          'Connect Make (formerly Integromat) to trigger automation scenarios when users submit feedback, when statuses change, and when comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.make.step1',
              defaultMessage:
                'Create a new scenario in Make and add a <b>Webhooks</b> module as the trigger.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.make.step2',
              defaultMessage:
                'Copy the webhook URL and paste it below, then click <b>Save</b>. Quackback will send a test payload.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.make.step3',
            defaultMessage:
              'Choose which events should trigger your scenario, then continue building in Make.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <MakeConfig
        integrationId={integration.id}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  monday: {
    type: 'monday',
    catalog: catalogs.mondayCatalog,
    Icon: getIntegrationIcon('monday')!,
    ConnectionActions: MondayConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.monday.title',
        defaultMessage: 'Connect Monday.com',
      },
      description: {
        id: 'admin.integrations.setup.monday.description',
        defaultMessage: 'Connect Monday.com to create items from feedback in your selected board.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.monday.step1',
              defaultMessage:
                'Configure your Monday.com <b>OAuth credentials</b> in the platform settings.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.monday.step2',
              defaultMessage:
                'Click <b>Connect Monday.com</b> to authorize Quackback with your Monday.com workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.monday.step3',
            defaultMessage:
              'Select a board to create items in, then choose which events should trigger new items.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <MondayConfig
        integrationId={integration.id}
        initialConfig={(integration.config ?? {}) as { boardId?: string }}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  n8n: {
    type: 'n8n',
    connectForm: true,
    catalog: catalogs.n8nCatalog,
    Icon: getIntegrationIcon('n8n')!,
    ConnectionActions: N8nConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.n8n.title',
        defaultMessage: 'Connect n8n',
      },
      description: {
        id: 'admin.integrations.setup.n8n.description',
        defaultMessage:
          'Connect n8n to trigger automated workflows when users submit feedback, when statuses change, and when comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.n8n.step1',
              defaultMessage: 'Create a new workflow in n8n and add a <b>Webhook</b> trigger node.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.n8n.step2',
              defaultMessage:
                'Copy the production webhook URL and paste it below, then click <b>Save</b>. Quackback will send a test payload.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.n8n.step3',
            defaultMessage:
              'Choose which events should trigger your workflow, then continue building in n8n.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <N8nConfig
        integrationId={integration.id}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  notion: {
    type: 'notion',
    catalog: catalogs.notionCatalog,
    Icon: getIntegrationIcon('notion')!,
    ConnectionActions: NotionConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.notion.title',
        defaultMessage: 'Connect your Notion workspace',
      },
      description: {
        id: 'admin.integrations.setup.notion.description',
        defaultMessage:
          'Connect Notion to automatically create database items when users submit feedback. Link feedback to your product roadmap in Notion.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.notion.step1',
              defaultMessage:
                'Click <b>Connect Notion</b> to authorize Quackback with your Notion workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.notion.step2',
            defaultMessage:
              'Select which database new feedback items should be created in. The database must have a Title property.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.notion.step3',
            defaultMessage:
              'Choose which events trigger new database items. You can change this at any time.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <NotionConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  ntfy: {
    type: 'ntfy',
    connectForm: true,
    catalog: catalogs.ntfyCatalog,
    Icon: getIntegrationIcon('ntfy')!,
    ConnectionActions: NtfyConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.ntfy.title',
        defaultMessage: 'Connect ntfy',
      },
      description: {
        id: 'admin.integrations.setup.ntfy.description',
        defaultMessage:
          'Connect ntfy to receive instant push notifications when users submit feedback, statuses change, and comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.ntfy.step1',
              defaultMessage:
                'Create a topic on <b>ntfy.sh</b> or your self-hosted ntfy server. Copy the full topic URL (e.g. <code>https://ntfy.sh/my-alerts</code>).',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.ntfy.step2',
              defaultMessage:
                'Paste the topic URL below. If your topic is protected, add an access token too. Click <b>Save</b>. Quackback will send a test notification to verify the channel.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.ntfy.step3',
            defaultMessage:
              'Choose which events should trigger notifications, then install the ntfy app on your devices and subscribe to your topic.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <NtfyConfig
        integrationId={integration.id}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  salesforce: {
    type: 'salesforce',
    catalog: catalogs.salesforceCatalog,
    Icon: getIntegrationIcon('salesforce')!,
    ConnectionActions: SalesforceConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.salesforce.title',
        defaultMessage: 'Connect Salesforce',
      },
      description: {
        id: 'admin.integrations.setup.salesforce.description',
        defaultMessage:
          'Connect Salesforce to see customer and account details alongside feedback.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.salesforce.step1',
              defaultMessage:
                'Configure your Salesforce <b>Connected App credentials</b> in the platform settings.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.salesforce.step2',
              defaultMessage:
                'Click <b>Connect Salesforce</b> to authorize Quackback with your Salesforce org.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>{intl.formatMessage(LOOKUP_BY_EMAIL)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <CustomerContextConfig integrationId={integration.id} enabled={isConnected} />
    ),
  },

  // NOTE: segment's route diverges from the standard shape in three ways,
  // preserved here: (1) no `getIntegrationIcon` entry exists for segment (it's
  // neither a tracker nor a feedback-source badge in integration-ui.tsx), so
  // its route renders an inline "S" glyph rather than a brand icon - wrapped
  // in `SegmentIcon` above to fit the `Icon` contract; (2) it has no config
  // panel and no `PlatformCredentialsDialog`/credentials button at all, just
  // connect/disconnect actions; (3) "connected" for segment covers both
  // `active` and `paused` status (same as the header's own isConnected/isPaused
  // union elsewhere, so no divergence in the shared route's rendering).
  segment: {
    type: 'segment',
    connectForm: true,
    catalog: catalogs.segmentCatalog,
    Icon: SegmentIcon,
    ConnectionActions: SegmentConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.segment.connectLabel',
        defaultMessage: 'Connect Segment',
      },
      description: {
        id: 'admin.integrations.setup.segment.description',
        defaultMessage:
          'Verify signed identify events and optionally publish segment membership changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.segment.step1',
            defaultMessage: 'Copy the signing secret from your Segment source or destination.',
          })}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.segment.step2',
              defaultMessage:
                'Send identify events to <endpoint>/api/integrations/segment/identify</endpoint>.',
            },
            { endpoint: (chunks: ReactNode) => <code>{chunks}</code> }
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.segment.step3',
            defaultMessage: 'Reconnect here whenever you rotate either secret.',
          })}
        </p>,
      ],
    },
  },

  shortcut: {
    type: 'shortcut',
    connectForm: true,
    catalog: catalogs.shortcutCatalog,
    Icon: getIntegrationIcon('shortcut')!,
    ConnectionActions: ShortcutConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.shortcut.title',
        defaultMessage: 'Connect your Shortcut workspace',
      },
      description: {
        id: 'admin.integrations.setup.shortcut.description',
        defaultMessage:
          'Connect Shortcut to create stories from feedback and review incoming status changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.shortcut.step1',
            defaultMessage:
              'Generate an API token from your Shortcut account settings and paste it below.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.shortcut.step2',
            defaultMessage: 'Select which project new feedback stories should be created in.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.shortcut.step3',
            defaultMessage:
              'Choose which events trigger story creation. You can change these settings at any time.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <ShortcutConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  slack: {
    type: 'slack',
    catalog: catalogs.slackCatalog,
    Icon: getIntegrationIcon('slack')!,
    ConnectionActions: SlackConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.slack.title',
        defaultMessage: 'Connect your Slack workspace',
      },
      description: {
        id: 'admin.integrations.setup.slack.description',
        defaultMessage: 'Post notifications to the Slack channel you choose.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.slack.step1',
            defaultMessage: 'Authorize Quackback to post messages to your Slack workspace.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.slack.step2',
            defaultMessage:
              'Select which channel notifications should be posted to. The bot must be added to private channels before they appear in the list.',
          })}
        </p>,
        <p>{intl.formatMessage(CHOOSE_EVENTS_NOTIFICATION)}</p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <SlackConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        notificationChannels={integration.notificationChannels}
        enabled={isConnected}
      />
    ),
  },

  stripe: {
    type: 'stripe',
    connectForm: true,
    catalog: catalogs.stripeCatalog,
    Icon: getIntegrationIcon('stripe')!,
    ConnectionActions: StripeConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.stripe.title',
        defaultMessage: 'Connect Stripe',
      },
      description: {
        id: 'admin.integrations.setup.stripe.description',
        defaultMessage: 'Connect Stripe to find customers by email and open their billing profile.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.stripe.step1',
              defaultMessage:
                'Create a <b>restricted API key</b> in your Stripe dashboard with read access to Customers.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.stripe.step2',
              defaultMessage:
                'Paste the API key below and click <b>Save</b>. Quackback will verify the connection.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.stripe.step3',
            defaultMessage:
              'Customer data will be automatically looked up by email when new feedback is submitted.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <CustomerContextConfig integrationId={integration.id} enabled={isConnected} />
    ),
  },

  teams: {
    type: 'teams',
    catalog: catalogs.teamsCatalog,
    Icon: getIntegrationIcon('teams')!,
    ConnectionActions: TeamsConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.teams.title',
        defaultMessage: 'Connect Microsoft Teams',
      },
      description: {
        id: 'admin.integrations.setup.teams.description',
        defaultMessage:
          'Connect Microsoft Teams to receive notifications when users submit feedback, when statuses change, and when comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.teams.step1',
            defaultMessage:
              'Register Quackback in your Azure AD workspace and add the Teams bot permissions.',
          })}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.teams.step2',
              defaultMessage:
                'Click <b>Connect Teams</b> to authorize Quackback to post to your Teams channels.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.teams.step3',
            defaultMessage:
              'Select a team and channel for notifications, then choose which events trigger messages.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <TeamsConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  trello: {
    type: 'trello',
    catalog: catalogs.trelloCatalog,
    Icon: getIntegrationIcon('trello')!,
    ConnectionActions: TrelloConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.trello.title',
        defaultMessage: 'Connect your Trello workspace',
      },
      description: {
        id: 'admin.integrations.setup.trello.description',
        defaultMessage:
          'Connect Trello to create cards from feedback and review incoming list changes.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.trello.step1',
            defaultMessage:
              'Create a Trello Power-Up in your workspace (optional, only needed for custom branding).',
          })}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.trello.step2',
              defaultMessage:
                'Click <b>Connect Trello</b> to authorize Quackback to access your Trello workspace.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.trello.step3',
            defaultMessage: 'Select which board and list new feedback cards should be created in.',
          })}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.trello.step4',
            defaultMessage:
              'Choose which events trigger card creation. You can enable or disable individual event types at any time.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <TrelloConfig
        integrationId={integration.id}
        initialConfig={integration.config}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },

  zapier: {
    type: 'zapier',
    connectForm: true,
    catalog: catalogs.zapierCatalog,
    Icon: getIntegrationIcon('zapier')!,
    ConnectionActions: ZapierConnectionActions,
    setup: {
      title: {
        id: 'admin.integrations.setup.zapier.title',
        defaultMessage: 'Connect Zapier',
      },
      description: {
        id: 'admin.integrations.setup.zapier.description',
        defaultMessage:
          'Connect Zapier to trigger automated workflows when users submit feedback, when statuses change, and when comments are added.',
      },
      steps: (intl) => [
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.zapier.step1',
              defaultMessage:
                'Create a new Zap in Zapier and add a <b>Webhooks by Zapier</b> trigger with <b>Catch Hook</b>.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage(
            {
              id: 'admin.integrations.setup.zapier.step2',
              defaultMessage:
                'Copy the webhook URL from Zapier and paste it below, then click <b>Save</b>. Quackback will send a test payload.',
            },
            RICH_TEXT
          )}
        </p>,
        <p>
          {intl.formatMessage({
            id: 'admin.integrations.setup.zapier.step3',
            defaultMessage:
              'Choose which events should trigger your Zap, then continue building your workflow in Zapier.',
          })}
        </p>,
      ],
    },
    renderConfig: ({ integration, isConnected }) => (
      <ZapierConfig
        integrationId={integration.id}
        initialEventMappings={integration.eventMappings}
        enabled={isConnected}
      />
    ),
  },
}

/** Look up a provider's settings entry by type (underscore form). */
export function getIntegrationSettingsEntry(type: string): IntegrationSettingsEntry | undefined {
  return INTEGRATION_SETTINGS[type]
}
