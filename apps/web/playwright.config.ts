import { defineConfig, devices } from '@playwright/test'
import { AUTH_STATE_PATH } from './e2e/utils/auth-state'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://acme.localhost:3000'

/**
 * Which server the suite runs against: the Vite dev server (default, best for
 * iterating on a spec) or the built output (`E2E_SERVER=production`, what CI
 * runs the full suite against).
 */
const serverKind = process.env.E2E_SERVER === 'production' ? 'production' : 'dev'

/** The port the built server must listen on, taken from the suite's own base URL. */
const serverPort = new URL(baseURL).port || '80'

/**
 * Playwright configuration for Quackback E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Use 1 worker per shard in CI (sharding provides parallelism, 1 worker reduces flakiness) */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use - blob for CI (enables sharding/merging), html for local */
  reporter: process.env.CI
    ? [['blob', { outputDir: 'blob-report' }], ['list']]
    : [['html', { outputFolder: 'playwright-report' }], ['list']],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for workspace subdomain (acme workspace from seed data) */
    baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project - authenticates and saves state */
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /global-teardown\.ts/,
    },

    /* Main test project using authenticated state (admin tests only) */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Use larger viewport to ensure detail panels are visible */
        viewport: { width: 1920, height: 1080 },
        /* Use saved auth state (PLAYWRIGHT_AUTH_STATE keeps parallel runs from sharing it) */
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['setup'],
      /* Only run admin tests (authenticated) */
      testMatch: /tests\/admin\/.+\.spec\.ts/,
    },

    /* Auth tests need fresh session (no stored state) */
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        /* No stored auth state - tests manage their own auth */
      },
      testMatch: /tests\/auth\/.+\.spec\.ts/,
    },

    /* Tests that don't need authentication (public portal) */
    {
      name: 'chromium-public',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /tests\/public\/.+\.spec\.ts/,
    },
  ],

  /* Start the app before the tests */
  webServer: {
    // `E2E_SERVER=production` boots the built output (`bun run build` first)
    // instead of the Vite dev server. The dev server compiles each route on
    // first request, which on a 2-core CI runner costs seconds per page and
    // is most of the suite's wall clock; the built server answers immediately.
    // CI's e2e-full job uses it, and it is also the closer match to how the
    // app actually ships. Defaults to the dev server for local iteration.
    command:
      serverKind === 'production'
        ? 'bun --env-file=../../.env .output/server/index.mjs'
        : // Bind every interface and wait on the health probe. Vite's default
          // localhost can be IPv6-only, and the first homepage request can 503
          // while Nitro is still coming up (`Vite environment "nitro" is unavailable`).
          `bun --env-file=../../.env vite dev --host 0.0.0.0 --port ${serverPort}`,
    // Both servers take their port from PORT: the built one has no flag for it,
    // and the dev one would otherwise pick up PORT from .env and disagree with
    // the URL this config probes.
    env:
      serverKind === 'production'
        ? { NODE_ENV: 'production', PORT: serverPort }
        : { PORT: serverPort },
    url: `${baseURL}/api/health/ready`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1' || !process.env.CI,
    timeout: 180 * 1000,
  },

  /* Timeout for each test */
  timeout: 30 * 1000,

  /* Timeout for each assertion */
  expect: {
    timeout: 5 * 1000,
  },
})
