/**
 * Centralized configuration with Zod validation.
 *
 * This module provides type-safe access to environment variables at runtime.
 * It uses getter functions to defer reading process.env until the value is
 * actually needed, avoiding Vite's build-time inlining of process.env values.
 *
 * Usage:
 *   import { config } from '@/lib/server/config'
 *   const dbUrl = config.databaseUrl // reads at runtime, not build time
 */

import { z } from 'zod'
import { logger } from '@/lib/server/logger'
import { getCurrentWorkspace } from '@/lib/server/workspaces/workspace-context'
import { MAIL_DOMAIN_RE } from '@/lib/server/utils/mail-domain'

const log = logger.child({ component: 'config' })

/**
 * A hostname that is a pattern rather than a host.
 *
 * `deploy/railway-template.yml` sets `BASE_URL: https://${{RAILWAY_PUBLIC_DOMAIN}}`,
 * and the moment a wildcard custom domain is attached that variable becomes the
 * literal string `*.example.com` (SAAS-HOSTING-STACK.md §9). `new URL()` accepts
 * it, so nothing downstream complains — it just produces email links, asset URLs
 * and cookie attributes for a host that does not exist.
 */
const WILDCARD_HOST_RE = /[*?]/

/**
 * The origin a `USER_CONTENT_URL` value names, or null when it is not a bare
 * http(s) origin. A path would be dropped from every file link built on it, so
 * it is refused rather than ignored.
 */
function parseUserContentOrigin(value: string): string | null {
  if (WILDCARD_HOST_RE.test(value) || /[?#]/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.pathname !== '/') return null
    return url.origin
  } catch {
    return null
  }
}

/** An RFC 9110 field name (`token`), already lowercased. */
const HEADER_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/

/**
 * Why a `TRUSTED_CLIENT_IP_HEADER` value cannot be used, or null when it can.
 * X-Forwarded-For is a list whose trust is positional, which is what
 * TRUSTED_PROXY_HOPS handles; the app's own `x-quackback-*` headers carry
 * addresses it resolved or verified itself and must never be taken from a proxy.
 */
function trustedClientIpHeaderProblem(name: string): string | null {
  if (!HEADER_TOKEN_RE.test(name)) return 'not a valid HTTP header name'
  if (name === 'x-forwarded-for') {
    return 'X-Forwarded-For is a list; use TRUSTED_PROXY_HOPS to pick the trusted entry instead'
  }
  if (name.startsWith('x-quackback-')) return 'x-quackback-* headers are reserved for the app'
  return null
}

// =============================================================================
// Schema Helpers
// =============================================================================

/** Treat empty strings as undefined (common in Docker/compose env vars). */
const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val)

/**
 * Parse boolean from env var string.
 * Rejects ambiguous values - only accepts: true/false, 1/0, or actual booleans.
 * Empty strings are treated as undefined.
 */
const envBoolean = z
  .preprocess(
    emptyToUndefined,
    z.union([
      z.literal('true').transform(() => true),
      z.literal('false').transform(() => false),
      z.literal('1').transform(() => true),
      z.literal('0').transform(() => false),
      z.boolean(),
    ])
  )
  .optional()

/**
 * Parse integer from env var string.
 * Rejects NaN and non-integer values.
 * Empty strings are treated as undefined.
 */
const envInt = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .transform((v, ctx) => {
      const num = parseInt(v, 10)
      if (isNaN(num)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid integer' })
        return z.NEVER
      }
      return num
    })
    .or(z.number().int())
)

// =============================================================================
// Schema Definition (camelCase property names)
// =============================================================================

const configSchema = z
  .object({
    // Core
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    baseUrl: z.string().url(),
    port: envInt.default(3000),

    // Database
    //
    // Optional in the schema so a test fixture can load config without one;
    // `config.databaseUrl` throws rather than returning undefined.
    databaseUrl: z.string().min(1).optional(),
    dbPoolMax: envInt.pipe(z.number().int().min(1).max(100)).optional(),
    dbIdleTimeout: envInt.pipe(z.number().int().min(1).max(3600)).default(20),

    // Auth
    secretKey: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
    // Rotation grace for OAuth refresh tokens (seconds). 0 disables healing
    // and restores strict single-use rotation. See auth/refresh-grace.ts.
    oauthRefreshGraceSeconds: envInt.default(7 * 24 * 60 * 60),

    trustedProxyHops: envInt.pipe(z.number().int().min(0).max(10)).default(0),
    /**
     * A single-value header the operator's reverse proxy sets (or overwrites)
     * to the client address, e.g. `x-real-ip` or `cf-connecting-ip`. Consulted
     * before TRUSTED_PROXY_HOPS; see getClientIp() in domains/api/rate-limit.
     */
    trustedClientIpHeader: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toLowerCase() || undefined : val),
      z.string().optional()
    ),

    // Email (all optional)
    emailFrom: z.string().optional(),
    emailSmtpHost: z.string().optional(),
    emailSmtpPort: envInt.optional(),
    emailSmtpUser: z.string().optional(),
    emailSmtpPass: z.string().optional(),
    emailSmtpSecure: envBoolean,
    /** Resend: sends when it is the one outbound provider, and fetches inbound bodies. */
    emailResendApiKey: z.string().optional(),
    /**
     * SES sending credentials. Deliberately not named `AWS_*` or `S3_*`: the
     * object-storage keys below are a different principal against a different
     * service, and a deployment that reused one for the other would
     * authenticate successfully against the wrong account.
     */
    emailSesAccessKeyId: z.string().optional(),
    emailSesSecretAccessKey: z.string().optional(),
    /** Region the sending identity is verified in. Never defaulted: a verified
     *  identity is regional, so a guess has every send rejected. */
    emailSesRegion: z.string().optional(),
    /** Configuration set applied to each send. Absent for a self-hoster. */
    emailSesConfigurationSet: z.string().optional(),
    /**
     * Most SES sends per second THIS process makes; sends beyond it wait for a
     * slot. The SES quota is per account and every process holding the
     * credential draws on it, so with N sending processes set roughly the
     * account quota divided by N. Unset, the transport paces at 10/s, under the
     * smallest production quota of 14/s. Read by the transport itself
     * (`sesMaxSendRate` in @quackback/email); validated here so a malformed value
     * stops boot instead of being quietly replaced by the default.
     */
    // Blank or whitespace-only is unset, as the transport reads it: coercing
    // `'  '` would give 0 and refuse a boot the transport would have run at
    // its default.
    emailSesMaxSendRate: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.coerce.number().positive().finite().optional()
    ),
    /**
     * SES credentials for VERIFYING a customer-owned sending domain. A
     * different principal from the sending pair above with a different grant:
     * creating identities consumes an account-wide quota, and the send path has
     * no business carrying that. Absent on an install that offers no
     * customer-owned sending domains, which refuses the feature by name rather
     * than falling back to the sending credential.
     */
    emailSesIdentityAccessKeyId: z.string().optional(),
    emailSesIdentitySecretAccessKey: z.string().optional(),
    /**
     * Send each workspace's mail under a provider tenant of its own, so the
     * provider tracks bounces and complaints per workspace and pauses only the
     * one at fault. Off by default. Needs the configuration set (a tenant sends
     * only with one associated) and the identity credential (which manages the
     * tenants); boot refuses it without either. Read by `sesTenantsEnabled` in
     * @quackback/email.
     */
    emailSesTenants: envBoolean,
    /**
     * Domain the operator serves bounce records under (a wildcard MX to the
     * provider's feedback host and a wildcard SPF TXT). Set, a new sending
     * domain's return path is one CNAME to `<workspace label>.<this domain>`
     * instead of an MX and a TXT. Read by `sesReturnPathDomain` in
     * @quackback/email; validated here so a malformed value stops boot rather
     * than quietly reading as unset.
     */
    emailReturnPathDomain: z.preprocess(
      (v) =>
        typeof v === 'string'
          ? v.trim() === ''
            ? undefined
            : v.trim().toLowerCase().replace(/\.$/, '')
          : v,
      z
        .string()
        .regex(MAIL_DOMAIN_RE, 'must be a domain name, such as bounces.example.net')
        .optional()
    ),

    // S3 (optional)
    s3Endpoint: z.string().optional(),
    s3Bucket: z.string().optional(),
    s3Region: z.string().optional(),
    s3AccessKeyId: z.string().optional(),
    s3SecretAccessKey: z.string().optional(),
    s3ForcePathStyle: envBoolean,
    s3PublicUrl: z.string().optional(),
    s3Proxy: envBoolean,
    /**
     * A separate origin user files are served from, e.g. `https://files.example.com`
     * pointed at this app. Attachment links handed to browsers load from there,
     * so a file opened in a tab runs nowhere near the app's cookies and storage.
     * Single-workspace installs only; see the getter.
     */
    userContentUrl: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    // A wildcard is a routing pattern, never an origin. Refused in every mode:
    // there is no deployment in which `https://*.example.com` is a usable base
    // URL, and the symptom of accepting one is a dead link in a customer's
    // inbox rather than an error anyone sees (SAAS-HOSTING-STACK.md §9).
    if (WILDCARD_HOST_RE.test(cfg.baseUrl)) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message:
          `BASE_URL is ${cfg.baseUrl}, which is a wildcard pattern rather than an origin. ` +
          'Set BASE_URL to the exact hostname this install is served from.',
      })
    }

    if (cfg.trustedClientIpHeader !== undefined) {
      const reason = trustedClientIpHeaderProblem(cfg.trustedClientIpHeader)
      if (reason) {
        ctx.addIssue({
          code: 'custom',
          path: ['trustedClientIpHeader'],
          message: `TRUSTED_CLIENT_IP_HEADER is ${cfg.trustedClientIpHeader}: ${reason}`,
        })
      }
    }

    if (cfg.userContentUrl !== undefined && !parseUserContentOrigin(cfg.userContentUrl)) {
      ctx.addIssue({
        code: 'custom',
        path: ['userContentUrl'],
        message:
          `USER_CONTENT_URL is ${cfg.userContentUrl}, which is not a bare http(s) origin. ` +
          'Set it to a scheme and host with no path, query or wildcard, e.g. https://files.example.com.',
      })
    }

    if (cfg.emailSesTenants) {
      const missing: string[] = []
      if (!cfg.emailSesConfigurationSet?.trim()) missing.push('EMAIL_SES_CONFIGURATION_SET')
      if (
        !cfg.emailSesIdentityAccessKeyId?.trim() ||
        !cfg.emailSesIdentitySecretAccessKey?.trim()
      ) {
        missing.push('EMAIL_SES_IDENTITY_ACCESS_KEY_ID and EMAIL_SES_IDENTITY_SECRET_ACCESS_KEY')
      }
      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['emailSesTenants'],
          message:
            `EMAIL_SES_TENANTS is on but ${missing.join(' and ')} must be set: a tenant sends ` +
            'only with a configuration set associated, and tenants are managed with the ' +
            'identity credential.',
        })
      }
    }

    // One process serves one database.
    if (!cfg.databaseUrl) {
      ctx.addIssue({ code: 'custom', path: ['databaseUrl'], message: 'DATABASE_URL is required' })
    }
  })

type Config = z.infer<typeof configSchema>

// =============================================================================
// Env → Config Mapping (explicit, greppable)
// =============================================================================

function buildConfigFromEnv(): unknown {
  // Empty strings → undefined so .optional() works with Docker/compose env vars
  const env = (key: string) => process.env[key] || undefined

  return {
    // Core
    nodeEnv: process.env.NODE_ENV,
    baseUrl: process.env.BASE_URL,
    port: env('PORT'),

    // Database
    databaseUrl: env('DATABASE_URL'),
    dbPoolMax: env('DB_POOL_MAX'),
    dbIdleTimeout: env('DB_IDLE_TIMEOUT'),

    // Auth
    secretKey: process.env.SECRET_KEY,
    oauthRefreshGraceSeconds: env('OAUTH_REFRESH_GRACE_SECONDS'),

    trustedProxyHops: env('TRUSTED_PROXY_HOPS'),
    trustedClientIpHeader: env('TRUSTED_CLIENT_IP_HEADER'),

    // Email
    emailFrom: env('EMAIL_FROM'),
    emailSmtpHost: env('EMAIL_SMTP_HOST'),
    emailSmtpPort: env('EMAIL_SMTP_PORT'),
    emailSmtpUser: env('EMAIL_SMTP_USER'),
    emailSmtpPass: env('EMAIL_SMTP_PASS'),
    emailSmtpSecure: env('EMAIL_SMTP_SECURE'),
    emailResendApiKey: env('EMAIL_RESEND_API_KEY'),
    emailSesAccessKeyId: env('EMAIL_SES_ACCESS_KEY_ID'),
    emailSesSecretAccessKey: env('EMAIL_SES_SECRET_ACCESS_KEY'),
    emailSesRegion: env('EMAIL_SES_REGION'),
    emailSesConfigurationSet: env('EMAIL_SES_CONFIGURATION_SET'),
    emailSesMaxSendRate: env('EMAIL_SES_MAX_SEND_RATE'),
    emailSesIdentityAccessKeyId: env('EMAIL_SES_IDENTITY_ACCESS_KEY_ID'),
    emailSesIdentitySecretAccessKey: env('EMAIL_SES_IDENTITY_SECRET_ACCESS_KEY'),
    emailReturnPathDomain: env('EMAIL_RETURN_PATH_DOMAIN'),
    emailSesTenants: env('EMAIL_SES_TENANTS'),

    // S3
    s3Endpoint: env('S3_ENDPOINT'),
    s3Bucket: env('S3_BUCKET'),
    s3Region: env('S3_REGION'),
    s3AccessKeyId: env('S3_ACCESS_KEY_ID'),
    s3SecretAccessKey: env('S3_SECRET_ACCESS_KEY'),
    s3ForcePathStyle: env('S3_FORCE_PATH_STYLE'),
    s3PublicUrl: env('S3_PUBLIC_URL'),
    s3Proxy: env('S3_PROXY'),
    userContentUrl: env('USER_CONTENT_URL'),
  }
}

// =============================================================================
// Config Loading
// =============================================================================

let _config: Config | null = null

function isBuildTime(): boolean {
  return process.env.QUACKBACK_BUILD === '1'
}

function loadConfig(): Config {
  if (_config) return _config

  if (isBuildTime()) {
    throw new Error('Config not available during build')
  }

  const result = configSchema.safeParse(buildConfigFromEnv())

  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      code: i.code,
    }))
    log.error({ issues }, 'config validation failed')
    throw new Error('Configuration validation failed')
  }

  _config = result.data
  return _config
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Config object with lazy getters.
 * Validates on first access, caches result.
 *
 * Usage:
 *   config.databaseUrl     // string
 *   config.emailSmtpHost   // string | undefined
 *   config.isDev           // boolean
 */
export const config = {
  // Core
  get nodeEnv() {
    return loadConfig().nodeEnv
  },
  /**
   * The origin this install is served from.
   *
   * Every absolute URL the app produces resolves from here — email links, asset
   * URLs, OAuth callbacks, the MCP resource metadata — as do better-auth's
   * `trustedOrigins` and the cookie `secure` flag.
   */
  get baseUrl() {
    return getCurrentWorkspace()?.routing.baseUrl ?? loadConfig().baseUrl
  },
  get port() {
    return loadConfig().port
  },
  /** The install's database. */
  get databaseUrl() {
    const url = loadConfig().databaseUrl
    if (!url) {
      throw new Error('DATABASE_URL is not configured.')
    }
    return url
  },
  get dbPoolMax() {
    const configured = loadConfig().dbPoolMax
    if (configured) return configured
    return process.env.QUACKBACK_ROLE === 'worker' ? 20 : 10
  },
  get dbIdleTimeout() {
    return loadConfig().dbIdleTimeout
  },
  get secretKey() {
    return loadConfig().secretKey
  },
  get oauthRefreshGraceSeconds() {
    return loadConfig().oauthRefreshGraceSeconds
  },

  get trustedProxyHops() {
    return loadConfig().trustedProxyHops
  },
  get trustedClientIpHeader(): string | undefined {
    return loadConfig().trustedClientIpHeader
  },

  // Email
  get emailFrom() {
    return loadConfig().emailFrom
  },
  get emailSmtpHost() {
    return loadConfig().emailSmtpHost
  },
  get emailSmtpPort() {
    return loadConfig().emailSmtpPort
  },
  get emailSmtpUser() {
    return loadConfig().emailSmtpUser
  },
  get emailSmtpPass() {
    return loadConfig().emailSmtpPass
  },
  get emailSmtpSecure() {
    return loadConfig().emailSmtpSecure
  },
  get emailResendApiKey() {
    return loadConfig().emailResendApiKey
  },
  get emailSesAccessKeyId() {
    return loadConfig().emailSesAccessKeyId
  },
  get emailSesSecretAccessKey() {
    return loadConfig().emailSesSecretAccessKey
  },
  get emailSesRegion() {
    return loadConfig().emailSesRegion
  },
  get emailSesConfigurationSet() {
    return loadConfig().emailSesConfigurationSet
  },
  get emailSesMaxSendRate() {
    return loadConfig().emailSesMaxSendRate
  },
  get emailSesIdentityAccessKeyId() {
    return loadConfig().emailSesIdentityAccessKeyId
  },
  get emailSesIdentitySecretAccessKey() {
    return loadConfig().emailSesIdentitySecretAccessKey
  },
  get emailReturnPathDomain() {
    return loadConfig().emailReturnPathDomain
  },
  get emailSesTenants() {
    return loadConfig().emailSesTenants
  },

  // S3
  get s3Endpoint() {
    return loadConfig().s3Endpoint
  },
  get s3Bucket() {
    return loadConfig().s3Bucket
  },
  get s3Region() {
    return loadConfig().s3Region
  },
  get s3AccessKeyId() {
    return loadConfig().s3AccessKeyId
  },
  get s3SecretAccessKey() {
    return loadConfig().s3SecretAccessKey
  },
  get s3ForcePathStyle() {
    return loadConfig().s3ForcePathStyle
  },
  get s3PublicUrl() {
    return loadConfig().s3PublicUrl
  },
  get s3Proxy() {
    return loadConfig().s3Proxy
  },
  /**
   * The origin user files are served from, or undefined to serve them from the
   * app's own origin.
   */
  get userContentUrl(): string | undefined {
    const cfg = loadConfig()
    if (!cfg.userContentUrl) return undefined
    return parseUserContentOrigin(cfg.userContentUrl) ?? undefined
  },

  // Help center
  get helpCenterDev() {
    return process.env.HELP_CENTER_DEV === 'true'
  },

  // Platform (OAuth-app) credential source.
  //   'db'  (default) — self-host: the integration_platform_credentials table + admin UI.
  //   'env' — credentials from INTEGRATION_<PROVIDER>_<FIELD> environment variables
  //           supplied by the deployment environment.
  get platformCredentialsSource(): 'db' | 'env' {
    return process.env.PLATFORM_CREDENTIALS_SOURCE === 'env' ? 'env' : 'db'
  },

  // Realtime chat transport, surfaced to clients via getConversationCapabilitiesFn.
  //   'live' (default) — SSE stream at /api/chat/stream.
  //   'poll' — force the portal onto the polling fallback for a
  //            deployment behind a proxy that buffers or drops event streams.
  // Direct process.env read (like helpCenterDev) so it works without a full config load.
  get chatTransportMode(): 'live' | 'poll' {
    return process.env.CHAT_TRANSPORT_MODE === 'poll' ? 'poll' : 'live'
  },

  // Convenience
  get isDev() {
    return this.nodeEnv === 'development'
  },
  get isProd() {
    return this.nodeEnv === 'production'
  },
  get isTest() {
    return this.nodeEnv === 'test'
  },
} as const

/** Validate every required runtime setting before traffic or workers start. */
export function validateRuntimeConfig(): void {
  if (isBuildTime()) return
  loadConfig()
}

/**
 * Get base URL, returns empty string during build.
 */
export function getBaseUrl(): string {
  try {
    return config.baseUrl
  } catch {
    return ''
  }
}

/**
 * Check if running in production.
 */
export function isProduction(): boolean {
  try {
    return config.isProd
  } catch {
    return false
  }
}

/**
 * Reset config cache (for testing).
 */
export function resetConfig(): void {
  _config = null
}

export type { Config }
