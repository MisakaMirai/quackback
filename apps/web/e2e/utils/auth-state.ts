/**
 * Where the signed-in admin storage state (the `setup` project's cookie jar)
 * is written and read.
 *
 * Fixed by default so a normal local or CI run behaves as before. Set
 * `PLAYWRIGHT_AUTH_STATE` to run two suites side by side — two worktrees, or
 * several runs against different databases on one machine — without their
 * `setup` projects overwriting each other's session:
 *
 *   PLAYWRIGHT_AUTH_STATE=e2e/.auth/admin-3112.json
 *   PLAYWRIGHT_BASE_URL=http://localhost:3112
 */
export const AUTH_STATE_PATH = process.env.PLAYWRIGHT_AUTH_STATE ?? 'e2e/.auth/admin.json'
