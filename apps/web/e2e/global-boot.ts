/**
 * Boot fixtures: workspace state every shard needs before its first test.
 *
 * Playwright's `globalSetup` runs once per `playwright test` invocation, before
 * any test and before any project — unlike the `setup` project, whose
 * `global-setup.ts` only runs in shards that contain a test depending on it.
 * A shard made up of `chromium-public` files has no such test, so the workspace
 * it runs against never got its magic-link method enabled. That is how
 * `post-submission` failed in e2e-full shard 8 of run 45405832661: the send was
 * answered without a verification row, so `getMagicLinkToken` found nothing for
 * demo@example.com while the shard's first 35 tests passed.
 *
 * Enabling the method here also keeps it on the path the app handles well: the
 * server has not served a request yet, so it builds its auth instance with
 * magic link from the start, exactly as in the shards where the `setup` project
 * runs first.
 */
import { clearSigninRateLimit, enableMagicLinkMethod } from './utils/db-helpers'

export default async function globalBoot(): Promise<void> {
  // Idempotent: a fresh seed has both off, and repeated runs change nothing.
  enableMagicLinkMethod()
  // Repeated runs from one machine trip the per-IP magic-link limiter; a shard
  // starts from a clean budget so its first sign-ins are not throttled.
  clearSigninRateLimit()
}
