# E2E coverage

What the Playwright suite in `apps/web/e2e` covers, how to run it, and where the
remaining gaps are. Written after a coverage audit of the suite and the batches
that followed it (PRs #20–#31).

## Running it locally

```bash
cd apps/web
PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 \
  ./node_modules/.bin/playwright test e2e/tests/admin/search.spec.ts
```

Two local-only wrinkles:

- **Host.** Specs default to `http://acme.localhost:3000` (the seeded workspace
  subdomain). Windows does not resolve `*.localhost` for Node, so the readiness
  probe in `playwright.config.ts` times out unless `PLAYWRIGHT_BASE_URL` points
  at `http://localhost:3000`. CI maps `acme.localhost` in `/etc/hosts`, so
  specs that assert the workspace host are CI-only as written.
- **`bun` on PATH.** The fixtures in `e2e/utils/db-helpers.ts` spawn `bun` to
  read/write test state. The npm install ships `bun.cmd`, which a child process
  cannot resolve; add `%APPDATA%\npm\node_modules\bun\bin` to `PATH`.

The dev server must be running (`bun run dev`) with the e2e database migrated
and seeded (`bun run db:migrate`, `bun run db:seed`). `PLAYWRIGHT_REUSE_SERVER=1`
reuses the running server instead of starting a second one.

### Running the suite the way CI does

CI runs the full suite against the **built** app, not the dev server, and splits
it across shards. The two knobs that make that reproducible locally:

| Variable                    | Effect                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_SERVER=production`     | Playwright starts `bun .output/server/index.mjs` (run `bun run build` first) instead of `vite dev`. This is what CI's `e2e-full` job uses; the dev server transforms each route on first request and is most of the suite's wall clock.                                                                          |
| `PLAYWRIGHT_AUTH_STATE`     | Where the `setup` project saves the signed-in admin state (default `e2e/.auth/admin.json`). Point two runs at different files and they no longer overwrite each other's session.                                                                                                                                 |
| `DISABLE_AUTH_RATE_LIMIT=1` | Turns off Better-Auth's own per-IP rate limiter, which otherwise spends its budget on the suite's own sign-ins and 429s whichever spec runs next. The app's own sign-in limiters (`auth/signin-rate-limit.ts`) stay on — several auth specs assert their exact shape. `e2e-full` sets this; nothing else should. |

So two shards can run side by side on one machine against their own databases —
each gets its own port, database, auth file and results directory:

```bash
# shard 1 of 2
cd apps/web
E2E_SERVER=production PLAYWRIGHT_BASE_URL=http://localhost:3111 \
  PLAYWRIGHT_AUTH_STATE=e2e/.auth/admin-3111.json \
  DATABASE_URL=postgresql://postgres:password@localhost:5432/quackback_e2e_1 \
  ./node_modules/.bin/playwright test --shard=1/2 --reporter=line --output=test-results-3111

# shard 2 of 2, in another terminal
cd apps/web
E2E_SERVER=production PLAYWRIGHT_BASE_URL=http://localhost:3112 \
  PLAYWRIGHT_AUTH_STATE=e2e/.auth/admin-3112.json \
  DATABASE_URL=postgresql://postgres:password@localhost:5432/quackback_e2e_2 \
  ./node_modules/.bin/playwright test --shard=2/2 --reporter=line --output=test-results-3112
```

## Coverage by area

| Area                        | Specs                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / security             | `auth/security`, `auth/unified-login`, `auth/identity-providers`, `auth/password-reset`, `public/auth`, `public/portal-settings`                                                                                    |
| Invitations                 | `admin/team-invitation`, `admin/portal-invite`                                                                                                                                                                      |
| Email link surfaces         | `public/email-links` (unsubscribe, CSAT)                                                                                                                                                                            |
| Support / inbox             | `admin/inbox`, `admin/support-conversation-flow`, `public/portal-support`, `admin/conversation-images`                                                                                                              |
| Status product              | `admin/status-incident-flow`, `admin/statuses`                                                                                                                                                                      |
| Search                      | `admin/search`, `admin/feedback-search`                                                                                                                                                                             |
| Preferences / subscriptions | `public/notification-preferences`, `public/notifications`                                                                                                                                                           |
| Data                        | `admin/csv-import-flow`, `admin/users-metadata-api`                                                                                                                                                                 |
| Settings                    | `admin/settings-surfaces` (render + legacy redirects), `settings-*` pages, `admin/settings-security-audit-log`                                                                                                      |
| Feedback / portal           | `public/post-*`, `public/comments`, `public/voting`, `public/board-access-matrix`, `public/post-submission`, `public/feed-filter-panel`, `public/portal-search`, `admin/post-management`, `admin/portal-feed-views` |
| Content                     | `admin/changelog`, `public/changelog`, `admin/help-center`, `public/help-center`                                                                                                                                    |
| Everything else             | `admin/dashboard`, `admin/analytics`, `admin/users*`, `admin/roadmap`, `admin/notifications`, `admin/mentions`, `admin/ask-quackback`, `public/base-ui-components`, `admin/base-ui-components`                      |

## Gaps closed in this pass

| PR  | Spec                                | What it now pins                                                                                                                                                 |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #20 | `auth/security`                     | Magic link single-use, tampered cookie, sign-out revocation, external `callbackURL` refusal, sign-in rate limit, cross-origin POST refusal, session cookie flags |
| #21 | `admin/support-conversation-flow`   | Visitor starts a conversation → inbox replies → visitor reads it; a closed conversation reopens on a visitor reply                                               |
| #22 | `public/email-links`                | Unsubscribe confirm/one-click/single-spend and CSAT record-on-click; **fix:** CSAT `?rating=` links 500'd (router parses numeric query values)                   |
| #23 | `auth/password-reset`               | Uniform reset request answer, form gating, single-use link, credential sign-in                                                                                   |
| #24 | `admin/team-invitation`             | Invite → emailed magic link → accept → teammate; anonymous preview; **fix:** invite links dropped their absolute `callbackURL`                                   |
| #25 | `admin/settings-security-audit-log` | Rate-limited sign-in appears in the audit log, filters, CSV export; retired route redirects                                                                      |
| #26 | `admin/portal-invite`               | Private-portal invite accept; wrong-account refusal; **fix:** an accepted invite rendered the error page (`isRedirect` probe)                                    |
| #27 | `admin/status-incident-flow`        | Report → public investigating → post update & resolve → public resolved; report dialog gating                                                                    |
| #28 | `public/notification-preferences`   | Pause-all-email and per-cell autosave persist server-side                                                                                                        |
| #29 | `admin/csv-import-flow`             | CSV preview → commit → posts exist; invalid rows are reported and never imported                                                                                 |
| #30 | `admin/settings-surfaces`           | 16 previously unvisited settings pages render; 7 legacy paths redirect                                                                                           |
| #31 | `admin/search`                      | Palette → results page, type filter, short/empty query states                                                                                                    |

## Known gaps

Deliberately not covered yet — each needs either external infrastructure or a
feature brief:

- **Onboarding.** The seeded workspace has already resolved its launch plan, so
  the flow is skipped (`admin/getting-started` skips for that reason).
- **Support configuration behaviour.** Ticket types/statuses, SLA policies,
  macros and office hours have render coverage only; creating and applying them
  in the inbox is untested.
- **Workspace export.** Needs object storage (the local MinIO/S3 endpoint is
  absent), so the run cannot complete today.
- **Email delivery and channel accounts.** SMTP/SES/Resend and inbound mail
  need provider fixtures; only the unconfigured paths are exercised.
- **SSO sign-in end-to-end.** `auth/identity-providers` seeds providers and
  checks routing, but a real code exchange needs a mock OIDC IdP.
- **MCP OAuth / DCR and the device flow.**
- **Webhook delivery.** Only the settings page is covered; no receiver.
- **Analytics drill-downs.** The page renders; filters and metric links are not
  driven.
- **Interface language.** The three-locale UI (`en`, `zh-cn`, `zh-tw`) has unit
  coverage; no spec switches locale and asserts the rendered copy.
- **Admin notification inbox interactions** (mark-all-read, row navigation).
