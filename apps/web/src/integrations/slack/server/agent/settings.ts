import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/functions/auth-helpers'
import { actorFromAuth } from '@/lib/server/audit/log'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { ValidationError } from '@/lib/shared/errors'
import { db, integrations, eq } from '@/lib/server/db'
import {
  getAssistantSettings,
  updateAssistantConfig,
} from '@/lib/server/domains/settings/settings.assistant'
import { missingSlackScopes } from '../../scopes'
export const getSlackAgentSettingsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.AI_TEAMMATE_MANAGE })
  const state = await getAssistantSettings()
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.integrationType, 'slack'),
  })
  const integrationConfig = (integration?.config ?? {}) as { scopes?: string; workspaceId?: string }
  const routing = 'direct' as const
  return {
    revision: state.revision,
    enabled: state.config.agents.workspace.slack.enabled,
    missingScopes: missingSlackScopes(integrationConfig.scopes),
    routing,
    active: integration?.status === 'active',
  }
})
export const setSlackAssistantEnabledFn = createServerFn({ method: 'POST' })
  .validator(z.object({ expectedRevision: z.number().int().positive(), enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.AI_TEAMMATE_MANAGE })
    if (data.enabled) {
      const row = await db.query.integrations.findFirst({
        where: eq(integrations.integrationType, 'slack'),
      })
      if (
        row?.status !== 'active' ||
        missingSlackScopes((row.config as { scopes?: string })?.scopes).length
      )
        throw new ValidationError(
          'SLACK_RECONNECT_REQUIRED',
          'Reconnect Slack before enabling the assistant.'
        )
    }
    return updateAssistantConfig(
      data.expectedRevision,
      (current) => ({
        ...current,
        agents: {
          ...current.agents,
          workspace: {
            ...current.agents.workspace,
            slack: { ...current.agents.workspace.slack, enabled: data.enabled },
          },
        },
      }),
      actorFromAuth(auth)
    )
  })
