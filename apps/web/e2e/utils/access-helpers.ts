/**
 * Helpers for the board-access-matrix e2e suite.
 *
 * - `loginViaMagicLink` establishes a session for ANY email on a context
 *   (Better-auth's magic-link verify auto-creates the user if new), mirroring
 *   the admin global-setup flow. Lets a single public project drive multiple
 *   real identities (admin / authenticated user / segment member).
 * - `setupAccessFixtures` / `setWorkspaceAnon` / `setPortalAuthMethods` drive
 *   deterministic DB setup via CLI scripts (same pattern as db-helpers.ts).
 * - `flushMagicLinkRateLimit` clears the per-email rate-limit keys in Redis so
 *   repeated e2e runs don't hit the sign-in rate limiter.
 */
import { execFileSync } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { expect, type BrowserContext } from '@playwright/test'
import {
  getMagicLinkToken,
  ensureTestUserHasRole,
  clearSigninRateLimit,
  enableMagicLinkMethod,
} from './db-helpers'

const __dirname = dirname(fileURLToPath(import.meta.url))

function runScript(scriptRelPath: string, args: string[]): string {
  const scriptPath = resolve(__dirname, scriptRelPath)
  // bun --env-file, not the dotenv CLI: GitHub runners ship a Ruby dotenv
  // first on PATH that rejects -e. execFileSync so args stay uninterpreted.
  return execFileSync('bun', ['--env-file=../../.env', scriptPath, ...args], {
    encoding: 'utf-8',
    cwd: resolve(__dirname, '../..'), // apps/web
  }).trim()
}

export interface BoardFixture {
  slug: string
  postId: string
}

export interface AccessFixtures {
  segmentId: string
  memberPrincipalId: string
  boards: {
    public: BoardFixture
    allanon: BoardFixture
    segview: BoardFixture
    mixedseg: BoardFixture
    private: BoardFixture
    mod: BoardFixture
  }
}

/**
 * Provision the e2e-* boards + segment and add `memberEmail` to the segment.
 * The member must already exist (sign them in once before calling this).
 */
export function setupAccessFixtures(memberEmail: string): AccessFixtures {
  return JSON.parse(
    runScript('../scripts/setup-access-fixtures.ts', [memberEmail])
  ) as AccessFixtures
}

/** Flip the workspace `features.allowAnonymous` master switch. */
export function setWorkspaceAnon(enabled: boolean): void {
  runScript('../scripts/set-workspace-anon.ts', [String(enabled)])
  // `portal_config` is written as raw SQL, so the running server keeps serving
  // the switch it cached under 'settings:workspace' until that key is dropped —
  // without this, an OFF→ON→OFF flip inside one run still serves the ON value
  // to the next page render.
  runScript('../scripts/bust-caches.ts', ['settings:workspace'])
}

/**
 * Disable or restore portal public auth methods (password, magicLink, OAuth
 * providers) in `settings.portal_config.oauth`. Used by tests that need to
 * verify the team break-glass form is still served when the portal offers no
 * public sign-in methods. Always call `setPortalAuthMethods('restore')` in a
 * `finally` block so subsequent tests/dev aren't left with a broken portal.
 *
 * Busts the workspace-settings cache for the same reason `setPortalVisibility`
 * does: `portal_config` is written as raw SQL, so a running server keeps
 * serving the sign-in methods it cached until the key is dropped.
 */
export function setPortalAuthMethods(action: 'disable' | 'restore' | 'enable-magic-link'): void {
  runScript('../scripts/set-portal-auth-methods.ts', [action])
  runScript('../scripts/bust-caches.ts', ['settings:workspace'])
}

/**
 * Flush the magic-link per-email rate-limit buckets so that repeated e2e runs
 * on the same email addresses don't hit the sign-in limiter. No-op when no rows
 * exist. Delegates to db-helpers' script-backed implementation (the single
 * owner of the signin:magiclink:* key prefix), which goes straight to the
 * database and so also works in CI.
 */
export function flushMagicLinkRateLimit(): void {
  clearSigninRateLimit()
}

/** Config for {@link seedIdentityProvider} (mirrors the seed script's input). */
export interface SeedIdpConfig {
  registrationId: string
  label: string
  clientId: string
  discoveryUrl?: string
  enabled?: boolean
  showButton?: boolean
  clientSecret?: string
  domain?: { name: string; verified?: boolean; enforced?: boolean }
}

/**
 * Drop the workspace-settings + configured-integration-types caches so the
 * running dev server immediately reflects a raw-SQL provider mutation (these
 * caches normally only invalidate via the app's own write paths).
 *
 * Runs after the seed script has bumped `settings.auth_config_version`, so the
 * re-read settings row carries the new version and the server rebuilds its
 * cached auth instance. Dropping these keys alone is not enough: a warm process
 * compares the version before it will rebuild.
 */
function invalidateAuthCaches(): void {
  runScript('../scripts/bust-caches.ts', ['settings:workspace', 'platform-cred:configured-types'])
}

/**
 * Seed an identity_provider row (+ encrypted credential + optional verified
 * domain) and bust the auth caches. Idempotent on `registrationId`. Pair with
 * {@link removeIdentityProvider} in an `afterAll`/`finally` so the workspace is
 * left clean.
 */
export function seedIdentityProvider(cfg: SeedIdpConfig): void {
  runScript('../scripts/seed-identity-provider.ts', ['seed', JSON.stringify(cfg)])
  invalidateAuthCaches()
}

/** Remove a seeded identity provider (cascades its domains, drops its credential). */
export function removeIdentityProvider(registrationId: string): void {
  runScript('../scripts/seed-identity-provider.ts', ['remove', registrationId])
  invalidateAuthCaches()
}

/**
 * Set the portal visibility to 'private' or 'public' and bust the workspace-settings
 * cache so the running dev server sees the change immediately.
 *
 * Always restore to 'public' in a `finally` block so subsequent tests and dev
 * sessions are not left behind a locked gate.
 */
export function setPortalVisibility(visibility: 'private' | 'public'): void {
  runScript('../scripts/set-portal-visibility.ts', [visibility])
  // The portal-access decision is cached under 'settings:workspace'. Drop it so
  // the dev server evaluates the new visibility on the next request.
  runScript('../scripts/bust-caches.ts', ['settings:workspace'])
}

/**
 * Sign `email` into `context` via the magic-link flow (auto-creates the user if
 * new). After this the context's cookies carry the session. Pass `role:'admin'`
 * to also promote the principal to admin (for team-identity tests).
 */
export async function loginViaMagicLink(
  context: BrowserContext,
  email: string,
  opts: { role?: 'admin' | 'member' | 'user' } = {}
): Promise<void> {
  // The whole exchange is retried, not just the send:
  //
  // - The endpoint is rate limited per address and per IP, and one shard signs
  //   several identities in through it; a throttled send must not fail the test
  //   on the limiter's schedule (the specs that assert the limiter's shape drive
  //   the endpoint themselves).
  // - Enabling the method writes `settings.auth_config` and bumps its version,
  //   and a server that has already built its auth instance for this workspace
  //   keeps serving the previous provider set until it re-reads. A send inside
  //   that window is answered 2xx without a verification row being written —
  //   which is what a public-only shard hit: `getMagicLinkToken` found nothing
  //   for demo@example.com after a successful send (e2e-full shard 8 of run
  //   45405832661). Re-enabling and re-sending until the row exists converts
  //   that window into a bounded wait.
  let token = ''
  let lastStatus: number | string = 'no attempt'
  await expect(async () => {
    enableMagicLinkMethod()
    flushMagicLinkRateLimit()
    const send = await context.request.post('/api/auth/sign-in/magic-link', {
      data: { email, callbackURL: '/' },
    })
    lastStatus = send.status()
    expect(send.ok(), `magic-link send for ${email}`).toBeTruthy()
    token = getMagicLinkToken(email)
    expect(
      token.length,
      `magic-link verification row for ${email} (last send ${lastStatus})`
    ).toBeGreaterThan(8)
  }).toPass({ timeout: 60_000 })

  const verify = await context.request.get(
    `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent('/')}`,
    { maxRedirects: 5 }
  )
  expect(verify.ok(), `magic-link verify for ${email}`).toBeTruthy()

  if (opts.role) ensureTestUserHasRole(email, opts.role)
}
