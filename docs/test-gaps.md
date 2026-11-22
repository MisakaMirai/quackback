# Test coverage gaps

An audit of what the test suite does and does not cover, and the batches that
close the gaps. The sibling [e2e coverage note](./e2e-coverage.md) covers the
Playwright suite; this note starts from the unit/integration side and tracks
the work.

## The numbers (on `dev`)

- `apps/web/src`: 2,529 source files, 2,192 unit/integration test files.
- `apps/web/src/lib/server`: 937 non-test modules, 910 test files — very close to
  one test file per module.
- `apps/web/e2e/tests`: 52 specs. (Twelve new specs sit in PRs #20–#31 and are
  not on `dev` yet; see the e2e note.)

So the suite is dense, and "gaps" are the exceptions rather than the rule.

## How the gap list was produced

A static reference scan: every module under `lib/server` is searched for by
file name across all unit test files; modules no test mentions (and that are
not type-only modules, queues or registries) are candidates. Reproduce it with:

```powershell
$tests = (Get-ChildItem apps/web/src,packages -Recurse -File -Include *.test.ts,*.test.tsx,*.db.test.ts |
  ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
Get-ChildItem apps/web/src/lib/server -Recurse -File -Include *.ts |
  Where-Object { $_.Name -notmatch '__tests__|\.test\.|\.d\.ts$|\.types\.ts$|index\.ts$' } |
  ForEach-Object {
    $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
    if ($tests -notmatch [regex]::Escape($name)) { $_.FullName }
  }
```

The scan is a heuristic. It misses indirect coverage (a test importing a
parent module that re-exports the helper), and it cannot tell a thin
registration module from a branchy one — so line counts were read for the
largest candidates before testing them. The 82 hits below were then triaged by
hand; type-only files (`*.types.ts`), worker registrations and `index.ts`
barrels were dropped.

## Gaps by area

Queues (`*-queue.ts`) and registries (`routing.registry.ts`) are excluded below:
they are thin worker registrations whose behaviour belongs to their processors.

| Area                 | Untested modules                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                 | `auth/read-sso-claims`                                                                                                                                                                                                                                                                                                                                                                                                  |
| Authorization / keys | `domains/api-keys/workspace-key-role`                                                                                                                                                                                                                                                                                                                                                                                   |
| Search               | `domains/search/search-match`, `domains/search/workspace-search`                                                                                                                                                                                                                                                                                                                                                        |
| SLA                  | `domains/sla/sla.pause-history`, `domains/sla/sla.messages`                                                                                                                                                                                                                                                                                                                                                             |
| Conversations        | `domains/conversation/conversation.transcript`, `conversation.email-envelope`, `conversation.spam-signals`, `conversation.github-inbound-store`, `conversation-segment.service`                                                                                                                                                                                                                                         |
| Channel accounts     | `sending-domain-records`, `sending-domain-name`, `sending-domain-check-write`                                                                                                                                                                                                                                                                                                                                           |
| Tickets              | `tickets/ticket-status-sync`, `tickets/ticket-embed.service`                                                                                                                                                                                                                                                                                                                                                            |
| Posts                | `post.public.views`, `post.public.team-filters`, `post.admin-panels`, `post.admin-inbox`, `post-status-sync`, `comment-page`                                                                                                                                                                                                                                                                                            |
| Principals           | `team-promotion`, `anon-sweep.service`                                                                                                                                                                                                                                                                                                                                                                                  |
| Analytics            | `analytics-dashboard`, `analytics-dashboard.queries`, `device-link.service`                                                                                                                                                                                                                                                                                                                                             |
| Data                 | `export/workspace-export`, `export/export-run-processor`, `files/preview/workbook-parts`                                                                                                                                                                                                                                                                                                                                |
| Help center          | `help-center.slug`, `help-center.editors`, `help-center.default-category`                                                                                                                                                                                                                                                                                                                                               |
| Settings             | `settings-registry/settings-change.areas`, `settings-change.storage`, `settings/tier-limits.write`                                                                                                                                                                                                                                                                                                                      |
| Integrations         | `webhook-payload`, `oauth-fragment`, `channels/deliver-agent-message`, `user-sync-types`, `inbound-types`                                                                                                                                                                                                                                                                                                               |
| API schemas          | `api/schemas/posts.admin`, `posts.votes`, `tickets-write`, `conversations-write`                                                                                                                                                                                                                                                                                                                                        |
| Functions            | `post-merge`, `conversation-panels`, `segment-integration`, `external-statuses`, `auth-errors`, `one-click-unsubscribe`                                                                                                                                                                                                                                                                                                 |
| HTTP                 | `cache-headers`, `request-host`, `same-origin-form`                                                                                                                                                                                                                                                                                                                                                                     |
| Other                | `mcp/tool-call-audit`, `messages/pair-link`, `middleware/audit-attribution`, `email/email-log.query`, `email/email-log.retention`, `changelog-email-body`, `domain-proof/sso-domain-lapse`, `domain-proof/ensure-domain`, `onboarding/setup-token-store`, `macros/macro.service`, `utils/ip-hash`, `utils/next-position`, `utils/position-case`, `status/status.projection`, `status/status.labels`, `test-email-alias` |

## Deliberately not unit-tested

These are exercised end to end instead, because their contracts are HTTP or
browser behaviour rather than functions:

- Rate limiters and auth hooks — driven by `auth/security.spec.ts` (PR #20).
- Magic-link/unsubscribe/CSAT token mints — driven by `public/email-links.spec.ts`
  and `auth/password-reset.spec.ts` (PRs #22, #23).
- Route loaders — exercised through the e2e specs for each route.

## Batches

| Batch | Scope                                                                     | Status  |
| ----- | ------------------------------------------------------------------------- | ------- |
| 1     | Grant ceiling (`role.ceiling`, `role.grants`) and API-key refusal mapping | this PR |
| 2     | Search ranking (`search-match`, `workspace-search`)                       | planned |
| 3     | Channel-account sending-domain helpers (records, name, check-write)       | planned |
| 4     | SLA pause history and customer-facing message copy                        | planned |
| 5     | Conversation transcript and email envelope                                | planned |
| 6     | Webhook payload shaping                                                   | planned |
| 7     | One-click unsubscribe handler                                             | planned |
| 8     | HTTP helpers (`cache-headers`, `request-host`, `same-origin-form`)        | planned |
