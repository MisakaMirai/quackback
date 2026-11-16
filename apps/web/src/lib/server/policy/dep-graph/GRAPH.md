# Dependency graph (generated, do not edit by hand)

Regenerate with `bunx vitest run apps/web/src/lib/server/policy/dep-graph -u`.
A diff here means a dependency edge or cycle was added or removed. Review it as an architecture change, then commit the regenerated file.

Edges come from static analysis of import / export-from / string-literal dynamic-import specifiers. Type-only imports count. Self-edges are omitted.

## 1. Workspace packages

Nodes (5): apps/web, packages/db, packages/email, packages/ids, packages/logger

| From | To | Evidence |
| --- | --- | --- |
| apps/web | packages/db | declared + imported |
| apps/web | packages/email | declared + imported |
| apps/web | packages/ids | declared + imported |
| apps/web | packages/logger | declared + imported |
| packages/db | packages/ids | declared + imported |
| packages/email | packages/logger | declared + imported |

Hard rule (test-enforced, not just snapshotted): no package imports app code.

## 2. apps/web/src buckets

Top-level directories of src, with lib split one level deeper; root-level files form `(root)`. The components -> lib/server edge is the TanStack Start server-function pattern, recorded as reality.

Nodes (12): (root), components, integrations, lib/build, lib/client, lib/server, lib/shared, locales, routes, styles, test, types
Edges (27):

- (root) -> components
- (root) -> lib/client
- (root) -> lib/server
- components -> integrations
- components -> lib/client
- components -> lib/server
- components -> lib/shared
- components -> routes
- integrations -> components
- integrations -> lib/client
- integrations -> lib/server
- integrations -> lib/shared
- lib/client -> lib/server
- lib/client -> lib/shared
- lib/server -> integrations
- lib/server -> lib/client
- lib/server -> lib/shared
- lib/shared -> integrations
- lib/shared -> lib/server
- lib/shared -> locales
- lib/shared -> styles
- routes -> (root)
- routes -> components
- routes -> integrations
- routes -> lib/client
- routes -> lib/server
- routes -> lib/shared

## 3. Server domains (lib/server/domains)

Nodes (46): activity, admin-overview, analytics, api, api-keys, attribute-definitions, boards, changelog, channel-accounts, channels, comments, conversation, conversation-attributes, conversation-views, domain-proof, export, files, help-center, import, inbox, macros, moderation, notifications, office-hours, onboarding, platform-credentials, post-tags, post-views, posts, principals, push-devices, roadmaps, roles, search, segments, settings, settings-registry, sla, status, statuses, subscriptions, teams, tickets, user-attributes, users, webhooks
Edges (88):

- activity -> principals
- admin-overview -> changelog
- analytics -> api
- analytics -> settings
- api -> api-keys
- api -> settings
- api -> webhooks
- api-keys -> principals
- api-keys -> roles
- boards -> posts
- boards -> settings
- changelog -> settings
- channel-accounts -> conversation
- channel-accounts -> domain-proof
- channel-accounts -> notifications
- channel-accounts -> settings
- channel-accounts -> subscriptions
- channels -> conversation
- comments -> activity
- comments -> posts
- comments -> settings
- comments -> subscriptions
- conversation -> changelog
- conversation -> channel-accounts
- conversation -> channels
- conversation -> comments
- conversation -> files
- conversation -> posts
- conversation -> principals
- conversation -> settings
- conversation -> sla
- conversation -> teams
- conversation -> tickets
- conversation-attributes -> conversation
- conversation-attributes -> settings
- domain-proof -> channel-accounts
- domain-proof -> settings
- export -> conversation
- export -> users
- files -> principals
- help-center -> domain-proof
- help-center -> principals
- help-center -> settings
- import -> principals
- inbox -> conversation
- inbox -> tickets
- macros -> conversation
- macros -> conversation-attributes
- moderation -> comments
- moderation -> posts
- onboarding -> api
- onboarding -> api-keys
- onboarding -> principals
- onboarding -> settings
- onboarding -> users
- posts -> activity
- posts -> changelog
- posts -> principals
- posts -> settings
- posts -> subscriptions
- principals -> roles
- principals -> settings
- principals -> teams
- roadmaps -> posts
- roles -> settings
- search -> help-center
- search -> posts
- settings -> domain-proof
- settings -> platform-credentials
- settings -> sla
- settings-registry -> api
- settings-registry -> api-keys
- settings-registry -> settings
- sla -> office-hours
- sla -> settings
- status -> settings
- subscriptions -> changelog
- subscriptions -> posts
- subscriptions -> status
- tickets -> conversation
- tickets -> files
- tickets -> principals
- tickets -> settings
- tickets -> sla
- tickets -> teams
- user-attributes -> attribute-definitions
- users -> principals
- webhooks -> settings

### Cycles

Strongly connected components with more than one domain. A new entry here is a new cycle and needs an explicit decision.

- activity <-> changelog <-> channel-accounts <-> channels <-> comments <-> conversation <-> domain-proof <-> files <-> posts <-> principals <-> roles <-> settings <-> sla <-> status <-> subscriptions <-> tickets
