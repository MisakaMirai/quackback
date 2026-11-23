import { z } from 'zod'

/**
 * Declarative Quackback config file schema.
 *
 * Loaded from `/etc/quackback/config.yaml`. Anything declared here is
 * reconciled into the `settings` row AND blocked from in-app UI
 * mutation; anything absent stays freely user-editable.
 *
 * Only fields with a legitimate platform-control story are in scope.
 * Workflow data (boards, posts, integrations, API keys, sessions) is
 * intentionally NOT representable here — keeps the lock surface small
 * and prevents the file from growing into a kitchen-sink schema.
 */

const useCaseSchema = z.enum([
  'product_feedback',
  'customer_support',
  'help_center',
  'status_page',
  'internal',
  // Legacy values still accepted in config files
  'saas',
  'consumer',
  'marketplace',
])

const workspaceSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    useCase: useCaseSchema.optional(),
    // Force the in-app onboarding wizard to be skipped. Set by the
    // control-plane on CP-provisioned workspaces where the operator did
    // the equivalent of the wizard out-of-band (named the workspace,
    // picked a plan) before the user ever sees the OSS portal. The
    // reconciler records a managed starting point and completion time so the
    // user sees the one-time activation handoff before entering the admin app.
    onboardingComplete: z.boolean().optional(),
  })
  .strict()

// Deprecated compatibility keys. `auth`, top-level `features` and `tierLimits`
// were managed by older config files, but are now in-app only (operator limits
// were removed with the hosted runtime). Keep accepting them for one release so
// old files do not make the whole watcher fail before supported workspace
// fields can reconcile. The reconciler deliberately ignores all three.
const deprecatedFeaturesSchema = z.record(z.string(), z.boolean())
const deprecatedAuthSchema = z.unknown()

export const quackbackConfigSchema = z
  .object({
    apiVersion: z.literal('quackback.io/v1'),
    kind: z.literal('QuackbackConfig'),
    metadata: z.object({ source: z.string().optional() }).strict().optional(),
    spec: z
      .object({
        workspace: workspaceSchema.optional(),
        tierLimits: z.unknown().optional(),
        features: deprecatedFeaturesSchema.optional(),
        auth: deprecatedAuthSchema.optional(),
      })
      .strict(),
  })
  .strict()

export type QuackbackConfig = z.infer<typeof quackbackConfigSchema>
export type QuackbackConfigSpec = QuackbackConfig['spec']

export function getDeprecatedConfigKeys(
  spec: QuackbackConfigSpec
): Array<'auth' | 'features' | 'tierLimits'> {
  const keys: Array<'auth' | 'features' | 'tierLimits'> = []
  if (Object.prototype.hasOwnProperty.call(spec, 'auth')) keys.push('auth')
  if (Object.prototype.hasOwnProperty.call(spec, 'features')) keys.push('features')
  if (Object.prototype.hasOwnProperty.call(spec, 'tierLimits')) keys.push('tierLimits')
  return keys
}

export function parseQuackbackConfig(input: unknown): z.ZodSafeParseResult<QuackbackConfig> {
  return quackbackConfigSchema.safeParse(input)
}
