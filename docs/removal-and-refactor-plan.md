# Quackback 后续移除与重构清单

> 基线：`refactor/remove-companies-widget-extra-locales` 分支，HEAD `0022c27d7`，工作区停在一次**未完成的 merge**（`MERGE_HEAD = d84d1cb8e`，merge base `19a6552df`）。
> 本文只做审计与计划，不改代码。数字均为 2026-11-16 在本机实测，复现命令见第 8 节。
> 已完成的三轮移除（云/计费、AI、公司 + Widget + 多余语言包）不在本文重复；本文回答「还剩什么」。

---

## 0. 结论（TL;DR）

1. **当前最该处理的不是「再删什么」，而是那场没合并完的 merge。** 32 个未合并路径、15 个文件里还留着 `<<<<<<<` 冲突标记，其中 `packages/db/drizzle/meta/_journal.json` 已经是**非法 JSON**，`db:migrate` / `db:check-drift` 现在跑不了。合并源 `origin/main` 是上游主线，**仍然完整带着 AI、assistant、billing、control-plane、telemetry、cloud settings、widget**；解决冲突时如果取上游侧，等于把刚删掉的东西再合回来。
2. **合并进来的新功能（Domains / Email senders）本身带着云耦合。** 新 Domains 页面引用了已删除的 `cloud-identity`、`billing` 模块（7 处），并且引用了 3 个当前不存在的文件、1 个不存在的路由；`context.cloudEnabled` / `billingEnabled` 也早已随云层删除。不先改写这些，typecheck/build 必挂。
3. **功能层面真正还剩下的「可删块」只有两个：**
   - **云托管多租户栈**：`lib/server/workspaces/` + `lib/server/fleet/` + `policy/module-state/`（应用内实现约 **9,500 行**）、外加独立的 `apps/web/workspace-probe/`（5,600 行）；测试合计约 **8,800 行**，另有 55 KB 的 `TENANCY.md`。自托管单 workspace 用不到，删掉是「零功能损失」的第二轮大扫除。
   - **产品分析（PostHog）**：可选的「后台上报自己的使用数据」，与自托管无关，建议删或至少默认关死。
4. **剩下的多数是「已删功能的残骸」，量不小但风险低**：AI/工作流残留（约 4,300 行实现/资产 + 10 个死 mock）、173×3 条 `automation.*` 文案、残留的权限/DB 表/列/配置键、README 与 docs 的 AI 段落、42 条 `server.json` 工具声明里 3 条已不存在。
5. **重构大头不是「删」，而是拆**：2,672 行的 `rich-text-editor`、2,598 行的 `agent-conversation-thread`、2,054 行的 `events/targets.ts`、640 个 server fn 挤在 109 个文件里、18 个近乎复制粘贴的集成配置页（集成 UI 共 5,282 行）。这些不该和「移除批次」混在一起做。

---

## 1. 现状测量

### 1.1 体量

| 指标                                      |                                                   数值 |
| ----------------------------------------- | -----------------------------------------------------: |
| `apps/web/src` 非测试源码                 |                            **2,570 文件 / 377,194 行** |
| `apps/web/src` 测试                       |        **1,753 文件 / 284,188 行**（测试/源码 ≈ 0.75） |
| 其中 `.db.test.ts`（需真实 Postgres）     |                                150（含 `packages/db`） |
| 其中 `.test.tsx` 组件测试                 |                                                    386 |
| `lib/server/functions`                    |                     109 文件 / 640 个 `createServerFn` |
| 集成 provider                             | 25 个 + `_template`（230 文件；UI 46 文件 / 5,282 行） |
| 语言包                                    |                  3 份 × 2,059 键（en / zh-cn / zh-tw） |
| 仍会 stub `QUACKBACK_TENANCY` 的测试      |                                                36 文件 |
| 引用 `lib/server/workspaces` 的非测试文件 |                                 45 文件 / 91 处 import |
| `isPooledTenancy` 调用                    |                                        31 文件 / 68 处 |
| `getCurrentWorkspace` 调用                |                                        18 文件 / 43 处 |
| `any` / `as any` / `<any>`（非测试）      |                                                 303 处 |
| `@ts-expect-error` / `@ts-ignore`         |                                                   9 处 |

### 1.2 上游与分支的关系（这是本次审计的关键背景）

| 项                               | 值                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 分支 HEAD                        | `0022c27d7 refactor(i18n): keep only en, zh-cn and zh-tw`                                                               |
| 正在合并的源                     | `origin/main` = `d84d1cb8e feat(domains): custom domains listed under their domain…(#996)`                              |
| merge base                       | `19a6552df`                                                                                                             |
| 上游自 base 起的改动             | **242 文件，+16,044 / −2,236**（Domains、Email senders、密码重置邮件等）                                                |
| 上游树里仍存在、本分支已删的系统 | `domains/ai`、`domains/assistant`、`domains/billing`、`settings/cloud`、`control-plane`、`telemetry`、`packages/widget` |
| 未合并路径                       | **32**（16 个 `UU`、16 个 `DU`）                                                                                        |
| 仍含冲突标记的文件               | **15**（含 `apps/web/perf/budgets.json`、`apps/web/perf/journeys.ts`、`_journal.json`、若干 `UU` 源码）                 |
| 当前数据库迁移状态               | `_journal.json` 非法 JSON → 迁移工具不可用                                                                              |

结论：**这不是一个可以「直接 rebase 上游」的分支**。每接一次上游，都要在冲突解决时坚持「删除侧」，并对上游新增代码做一次「去云化」。

---

## 2. P0：先把这场 merge 收尾（阻塞一切）

### 2.1 冲突分组与建议

| 组                   | 路径                                                                                                                                                                                                                                                                                   | 建议                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 生成物（5）       | `policy/authz-matrix/MATRIX.md`、`policy/dep-graph/GRAPH.md`、`policy/migration-contract/CONTRACT.md`、`policy/module-state/MODULE-STATE.md`、`jobs/JOBS.md`                                                                                                                           | **不要手改**。先解决源码冲突，再按各自脚本/测试重新生成，diff 只允许出现「本次新增/删除的路由与 job」                                                                                                                                   |
| B. 已删功能（6）     | `components/admin/settings/domains-cards.tsx`、`functions/cloud-identity.ts`、`functions/__tests__/cloud-custom-domain.test.ts`、`help-center/__tests__/help-center-domain-entitlement.test.ts`、`mcp/__tests__/ask-golden-sdk.db.test.ts`、`settings/__tests__/domains-card.test.tsx` | **保持删除**（`git rm`）。上游对新 Domains 页的版本要改写到本地 domain 服务（见 2.2）                                                                                                                                                   |
| C. 语言包（10）      | `locales/{ar,de,es,fr,nl,pl,pt-br,ru,th,uk}.json`                                                                                                                                                                                                                                      | **保持删除**。只留 en / zh-cn / zh-tw；上游新增的 3 个键要合并进这三份                                                                                                                                                                  |
| D. 新旧功能交叉（7） | `perf/budgets.json`、`perf/journeys.ts`、`components/admin/settings/email-channel-page.tsx`、`domain-proof/proven-zones.ts`、`domain-proof/__tests__/{hostname-proof,proven-zones}.db.test.ts`、`fleet/__tests__/migrator-gate.test.ts`                                                | 逐文件手工合并：保留上游的 Domains/Email 行为，去掉 cloud/entitlement/多租户假设；`migrator-gate` 随 P2 一起消失                                                                                                                        |
| E. 路由与导航（3）   | `routes/admin/settings.domains.tsx`、`lib/shared/settings-nav-sections.ts`、`policy/authz-matrix/classifications.ts`                                                                                                                                                                   | 手工合并 + 重新生成分类                                                                                                                                                                                                                 |
| F. 迁移账本（1）     | `packages/db/drizzle/meta/_journal.json`                                                                                                                                                                                                                                               | **重建为合法 JSON**。当前 staged 方案已把本分支三条移除迁移改名让位：`0312_drop_quackback_ai → 0316`、`0313_drop_companies → 0317`、`0314_drop_widget → 0318`，上游占 0312–0315。核对 idx 连续、`when` 单调递增、`tag` 与文件名一一对应 |

### 2.2 合并后必须做的「去云化改写」

新 Domains 页面是上游本轮的核心功能，但它的实现仍假设「有云控制面」：

| 位置                                                                   | 现状                                                                                                                                                                                                                                                                                                                                       | 改写                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/admin/settings.domains.tsx`                                    | 从 `@/lib/server/functions/cloud-identity` 引 `getCloudCustomDomainsFn` / `mutateCloudCustomDomainFn` / `getCloudIdentityFn` / `updateCloudIdentityFn` / `hasCustomDomainEntitlementFn` / `platformLabelFromHostname`；从 `@/lib/client/queries/billing` 引 `ensureBillingCatalogue`；读 `context.cloudEnabled` / `context.billingEnabled` | 删除整个 `OperatorHostnames` / `QuackbackUrlCard`（「Quackback 子域 + platform label」是云控制面概念）。「web address」这一 use 在自托管只映射到 help center 域名（代码注释自己已写明），改用 `updateHelpCenterDomainFn` + 本地 `functions/domains` |
| `components/admin/settings/domain-view.tsx:54`                         | `import { mutateCloudCustomDomainFn }`                                                                                                                                                                                                                                                                                                     | 同上，改走 `functions/domains`                                                                                                                                                                                                                      |
| `lib/client/domain-page-loader.ts:14`                                  | `import { getCloudCustomDomainsFn }`                                                                                                                                                                                                                                                                                                       | 删除该分支（自托管没有 operator 路由的 hostname）                                                                                                                                                                                                   |
| `routes/admin/settings.domains.tsx:129,147`                            | 跳 `/auth/origin-transfer`（**该路由已不存在**）                                                                                                                                                                                                                                                                                           | 删除 origin-transfer 跳转                                                                                                                                                                                                                           |
| `lib/client/domain-summaries.ts` / `lib/shared/domains-permissions.ts` | 仍有 `cloudEnabled` 参数                                                                                                                                                                                                                                                                                                                   | 参数改为常量/删除；`cloudEnabled` 在当前代码里已无 provider（只在参数与测试中出现）                                                                                                                                                                 |
| `lib/shared/platform-label.ts`                                         | `friendlyPlatformLabel` / `platformUrlSuffix`                                                                                                                                                                                                                                                                                              | 只保留 onboarding 用的 `friendlyPlatformLabel`；`platformUrlSuffix` 属于云子域，删                                                                                                                                                                  |
| 缺失文件                                                               | `components/admin/settings/domains-cards.tsx`、`lib/client/queries/billing.ts`、`lib/server/functions/cloud-identity.ts`                                                                                                                                                                                                                   | 前两者随 2.2 删除引用；`cloud-identity.ts` 保持删除                                                                                                                                                                                                 |

验收：全仓 `cloud-identity|ensureBillingCatalogue|hasCustomDomainEntitlement|cloudEnabled|billingEnabled|origin-transfer` → 0 命中（测试除外，且测试也要改）。

### 2.3 收尾顺序

```text
1. _journal.json 重建 → `bun run db:migrate` 在干净库与已迁移库各跑一次 → `bun run db:check-drift`
2. 按 A–F 解决 32 个路径；生成物最后重生成（routeTree 由 dev/build 重生成）
3. 2.2 的去云改写
4. 合并后回归：typecheck / lint / 定向测试 / build
5. 再提交 merge，commit message 里写清「哪些上游文件被去云化」
```

---

## 3. 功能级移除

### P1 — AI / 工作流残留（约 4,300 行实现/资产 + 10 个死 mock）

AI 产品本体已删，但代码层面还有四类残骸。

#### P1.1 死资产（直接删）

| 资产                                             |               体量 | 说明                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | -----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/evals/`                                | 20 文件 / 2,792 行 | harness / seed / judge 均 import 已删除的 `domains/assistant/*`、`domains/ai/*`、`domains/embeddings/*`；`scenarios/*` 也只为已删 agent 服务                                                                                                               |
| `apps/web/scripts/backfill-ai.ts`                |             612 行 | import `domains/ai/config`、`domains/ai/models`                                                                                                                                                                                                            |
| `apps/web/scripts/backfill-merge-suggestions.ts` |             481 行 | import `domains/ai/*` + 已删的 `mergeSuggestions` schema                                                                                                                                                                                                   |
| `apps/web/scripts/test-embeddings.ts`            |              83 行 | 直接查已删除的 `posts.embedding` 列                                                                                                                                                                                                                        |
| `.github/workflows/assistant-evals.yml`          |              91 行 | 名字、注释（Quinn）、`OPENAI_*`/`AI_*` secrets、`db:seed` + evals 全套；对已删代码跑测试，一旦有人配了 key 就会红                                                                                                                                          |
| 根 `package.json` 脚本                           |                  — | `ai:backfill`、`merge:backfill`、`evals`、`typecheck:evals` 四条                                                                                                                                                                                           |
| 依赖                                             |                  — | `@tanstack/ai`、`@tanstack/ai-client`、`@tanstack/ai-openai`、`@tanstack/ai-react`（全仓 0 引用）、`openai`（仅出现在 `client-import-protection` 的禁止清单与其测试里，可保留清单字符串、删依赖）、`@opentelemetry/api` 例外——`packages/logger` 在用，保留 |

#### P1.2 工作流引擎的残骸（删；保留数据值）

工作流引擎已随 AI 一起删除，但「设置 → 自动化」的读写链路、权限、事件元数据、DB 表还在：

- `lib/server/domains/settings/settings.workflows.ts`（119 行）——两族设置（abandoned auto-close / close-spam）；**读取方只剩已死的 close-if-spam 与一个没有 UI 的 server fn**。
- `lib/shared/workflows/{abandoned-auto-close,close-spam}.ts`（72 行）——其中 `assistantWaitMinutes()` 全仓只有定义。
- `lib/server/domains/conversation-attributes/close-if-spam.ts`（46 行）——`maybeCloseConversationIfSpamClassified` **0 个调用方**（只有自己的测试）。
- `lib/server/policy/service-actor.ts`（21 行）——`boundedServiceActor` 只被上面那个死文件使用。
- `lib/server/functions/settings.ts` 的 `fetchWorkflowAbandonedAutoCloseFn` / `updateWorkflowAbandonedAutoCloseFn` / `updateWorkflowCloseSpamFn`（约 60 行）+ 客户端 `lib/client/mutations/settings.ts` 的两个 hook（**0 个组件引用**）。
- 权限 `PERMISSIONS.WORKFLOW_MANAGE` 及其 RBAC catalogue 条目（7 个文件、20 处，除本链路外只有测试）。
- 事件：`AssistantHandedOffPayload` / `AssistantResolvedPayload`（0 引用）、`assistant.handed_off` handler 注释、`conversation.customer_unresponsive` / `teammate_unresponsive` 事件声明与 payload schema，以及 `dispatchConversationCustomerUnresponsive` / `...TeammateUnresponsive`（**0 调用方**；原设计由已删除的 workflow-sweep 触发）。
- 事件注册表的 `workflow` 曝光位与 `workflowEventTypes()`（0 读取方）。
- `conversation-attributes` 的 `sourceHint: 'ai' | 'workflow'`（历史数据值，保留读，但注释与写入分支已无 AI）。

#### P1.3 测试里的死 mock（10 个文件）

`vi.mock()` 指向不存在的模块，vitest 靠 factory 不报错，但它们在保护已经不存在的代码：

| mock 路径                                  | 文件                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domains/assistant/assistant.orchestrator` | `tickets/__tests__/ticket-convergence-1a.test.ts:106`、`conversation/__tests__/conversation-csat-concurrency.db.test.ts:62`                             |
| `domains/ai/config`                        | `events/__tests__/targets-webhook-match.test.ts:47`、`targets-cache.test.ts:69`、`targets-mention.test.ts:79`、`integration-target-coverage.test.ts:55` |
| `domains/embeddings/embedding.service`     | `conversation/__tests__/conversation-suggest-post.test.ts:36`、`functions/__tests__/portal-gate-public-posts.test.ts:182`                               |
| `domains/merge-suggestions/*`              | `events/__tests__/process.test.ts:98`、`mcp/__tests__/handler.test.ts:195`                                                                              |

#### P1.4 权限目录

`SUGGESTION_VIEW` / `SUGGESTION_MANAGE`（AI 合并建议队列）只剩权限定义本身，无任何路由/服务校验；`PERMISSION_CATEGORIES` 里空留 `'ai'` 分类注释；Admin/Manager 的描述仍写「customer-facing AI」。删权限要同步：`lib/shared/permissions.ts`、`packages/db/src/rbac-catalogue.ts`、mirror、`rbac-catalogue.test.ts`、`MATRIX.md`。

### P2 — 云托管多租户栈（XL：实现约 15,000 行 + 测试约 8,800 行）

这是「云已经删了，但云托管基座还在」的那一层。`QUACKBACK_TENANCY` 默认 `single`；`pooled` 模式要求 `QUACKBACK_CONTROL_DATABASE_URL` + 控制面侧的 workspace registry，而上游明确写「hosting configuration is not part of this repository」——自托管实际上**无法启用**。

| 模块                              |                       实现 |               测试 | 内容                                                                                                                                          |
| --------------------------------- | -------------------------: | -----------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/server/workspaces/`          |         26 文件 / 5,706 行 | 24 文件 / 4,618 行 | registry、resolver、pool-cache、fingerprint、quarantine、saas-edge-host、workspace-keyed、fleet pass、`vendor/` 契约、`TENANCY.md`（55.7 KB） |
| `lib/server/fleet/`               |            5 文件 / 985 行 |  8 文件 / 2,040 行 | migrator、schema-floor、ensure-schema-current、session-dsn、internal-auth                                                                     |
| `apps/web/workspace-probe/`       |         24 文件 / 5,602 行 |  7 文件 / 2,141 行 | 双 workspace 隔离探针（fake-fleet 37 KB），只为 pooled 设计；根 `typecheck` 脚本还包含它                                                      |
| `lib/server/policy/module-state/` | 3 文件 / 2,806 行 + 2 文档 |                  — | ledger（128 条：45 条 workspace 专用、16 条 fleet-wide）+ AST 扫描器；设计依据是 `SAAS-HOSTING-STACK.md §4.4` 的跨 workspace 串号             |

牵连面（45 个文件 import `workspaces`）：`db.ts` 的 Proxy、`auth/index.ts` + `session`、`jobs/{queue,runner,worker,wake}`、`kv/{pg-kv,sweep}`、`storage/*`、`email/*`、`events/{dispatch,event-dispatch-queue}`、`backfills/*`、`channel-accounts/*`、`conversation/email-*`、`middleware/workspace-context`、`startup.ts`、`boot-config.ts`、`platform-credentials`。

**必须保留 / 改名，不能顺手删：**

| 项                                                                            | 原因                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/server/cron/fleet-jobs.ts`                                               | 名字带 fleet，实际是**自托管的定时清扫**（kv sweep、daily maintenance、changelog reconciler），`QUACKBACK_CRON_JOB` 与启动 timer 都用它。删除前先改名 `cron/scheduled-jobs.ts` |
| `fleet/internal-auth.ts` + `jobs/wake.ts` + `routes/api/internal/job-wake.ts` | 自托管 `QUACKBACK_ROLE=web/worker` 拆分部署时的 web→worker 唤醒；建议保留机制，env 改名 `QUACKBACK_JOB_WAKE_TOKEN` 并去掉「cloud」措辞                                         |
| `backfills/batched.ts` 的 `migrationAppliedIn`                                | 来自 `fleet/schema-floor`，但自托管也在用；删 fleet 时改成直接查 drizzle 迁移账本                                                                                              |
| `config-file/`                                                                | `/etc/quackback/config.yaml` 声明式配置，是自托管能力（19 个引用点），不在本批                                                                                                 |
| `tierLimits` 数值上限                                                         | 自托管 operator 的配额保护，保留（见 P4.3 只清措辞）                                                                                                                           |

**执行顺序建议**：先删 `workspace-probe` 与 `module-state`（外围）→ 再删 `fleet/migrator` 系（保留迁移主路径）→ 最后把 `workspaces` 的 45 个消费点改成单 workspace 直连（`db` 静态化、`getCurrentWorkspace` 常量、`WorkspaceKeyedCache` → 普通 Map）。P2 是一个独立评审的 XL 批次，**不要**和 P1 混在一个 PR。

### P3 — 产品分析（PostHog，建议删）

| 项         | 位置                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 依赖       | `posthog-js`                                                                                                                                     |
| 服务端配置 | `config.ts` 的 6 个 `POSTHOG_*`（键、host、uiHost、session recording、mask text/inputs）、`productAnalytics` 投影、`functions/bootstrap.ts` 下发 |
| 客户端     | `components/shared/product-analytics.tsx`（143 行）、`lib/client/analytics.ts`（62 行）                                                          |
| 文档       | `.env.example`「Product analytics」整段、`docs/security.md` 第 9 行                                                                              |
| 测试       | `config-product-analytics.test.ts`、`product-analytics.test.tsx`（约 320 行）                                                                    |

它是「上报到 PostHog 的 admin 使用分析」，不是产品功能；对 fork/自托管没有价值，还会引入一个外部请求面。建议整体删除（含 `POSTHOG_*` 配置与 `.env.example` 段落）。若想保留为 operator 自建能力，至少把它默认关闭并在文档里写明「会外发数据」。

---

## 4. 数据、配置、文案残留（P4）

### P4.1 数据库

| 对象                                                                     | 现状                                                                                                    | 建议                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `workflows`、`workflow_runs`、`workflow_run_events`、`workflow_versions` | schema 仍在、`db.ts` barrel 仍导出；唯一读取方是 `principals/principal-repoint.ts` 的合并重指（防御性） | 引擎已不存在 → 新迁移 drop 四张表，同时删 repoint 里的 `workflowRuns` 分支与 seed 数据       |
| `workspace_experiments`（`schema/labs.ts`）                              | 只有 `db.ts` barrel 与 `seed.ts` 引用，无任何读取方（Labs 随 AI 移除）                                  | 新迁移 drop；删 schema、barrel、seed 引用                                                    |
| `settings.state`                                                         | 列注释自己写着「INERT：控制面用来挂起 workspace，OSS 已不读」                                           | 新迁移 drop 列 + 删类型/注释                                                                 |
| `settings.spam_filter_config.aiClassifier`                               | 无任何读写，仅 schema 注释与两条迁移测试提及                                                            | 注释改成历史遗留，或迁移清洗 JSON                                                            |
| `tier_limits.aiTokensPerMonth`                                           | AI 已删，但 `tier-limits.types.ts` 与 `config-file/schema.ts` 仍在定义/校验                             | 删字段 + config schema 键；注意 config-file 是声明式配置，删键要写 `getDeprecatedConfigKeys` |

### P4.2 配置与环境变量

- `.env.example`：整段 **AI（optional）**（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`AI_CHAT_MODEL`、`AI_EMBEDDING_MODEL` 及 8 个 per-feature override、`AI_REQUIRE_PARAMETERS`、`AI_REASONING_EXCLUDE`、`AI_COMBINED_TOOLS_AND_SCHEMA`）已无读取方（`config.ts` 0 命中）。
- `.env.example` 末尾「Cloud shared OAuth app credentials…」段落 → 删。
- `.env.prod.example`「AI (optional)」段落 → 删。
- `docs/configuration.md`：第 35 行「email, storage, **AI**, authentication…」；第 66 行标题「Integration credentials and the **Slack assistant**」；第 64 行 HNSW/embedding 调参段落（语义检索已无 embedding provider）→ 全部改写或删。
- `docs/database-reset-and-migration.md`：整篇是 AI 移除迁移的操作手册，且引用的 `0312_drop_quackback_ai.sql` 在本次 merge 里已改名为 `0316` → 要么归档到 `docs/archive/`，要么更新编号并标注「一次性、已完成」。

### P4.3 文案与权限措辞

- `tier-limits.types.ts`：`PlanNotice.trialPlan/choiceDueAt/ended`、`aiTokensPerMonth`、多处「cloud / paid tiers」注释；错误文案仍是「Upgrade to add more.」（`tier-enforce.ts`、`settings.service.ts` 各 1 处）。
- `rbac-catalogue.ts`：`SETTINGS_CUSTOM_DOMAIN` 注释「cloud identity gateway」、`SUGGESTION_*`、`WORKFLOW_MANAGE`、category `'ai'` 空壳、Admin 描述「customer-facing AI」、`channel_account` 注释「email / widget accounts」。
- `lib/shared/integration-credentials.ts`：文件头「Shared Cloud OAuth apps. Keep tenant and control-plane copies identical.」+ 常量名 `CLOUD_INTEGRATION_FIELDS` → 改名（如 `PLATFORM_INTEGRATION_FIELDS`）并改注释。
- `lib/server/domains/platform-credentials/cloud-source.ts`、`platform-credential.service.ts` 的 `'control-plane'` source：控制平面已删，`config.platformCredentialsSource` 在 pooled 时返回 `'control-plane'`（已不可达）→ 删该 source 与分支，保留 db/env。
- `lib/server/events/catalogue/assistant.ts`：文件名是 assistant，内容是 **SLA 事件声明**（`sla.approaching_breach`/`sla.breached`）→ 改名 `sla.ts`。
- `lib/shared/i18n.ts` 的 `'widget.'` 前缀 + 191 条 `widget.*` 键：现在服务的是 messenger/portal 复用组件。建议改名 `messenger.*`（58 处引用 + 3 份语言包；纯重命名，风险低但 diff 大）。
- `functions/portal.ts` 的 `WidgetVisibleBoard` 类型名 → `PortalVisibleBoard`。
- `lib/server/db.ts` 里「Retired assistant tables are no longer exported」等历史注释。

### P4.4 语言包

`en/zh-cn/zh-tw` 各 **173 条 `automation.*` 键、代码引用 0**（`automation.nav.*`、`automation.test.*`、`automation.condition.*`…）。删完是 519 条字符串。`intl:extract` 不会自动删除未用键，需要手工 prune，然后跑 `intl:extract` 与 locale parity 测试。

### P4.5 历史数据值（保留，不动）

以下 `'widget'` 值是**历史行**的语义，删类型会破坏老数据读取，保留：

- `conversations.source = 'widget'`（默认已是 `portal`）
- `user_segments.added_by = 'widget'`
- `page_views.surface = 'widget'`
- `session.scope` 里的历史 `'widget'`（`toSessionScope` 统一按 portal 处理）
- storage 前缀 `widget-images`（现有图片 URL，改名会 404）

---

## 5. 文档与元数据（P5）

| 位置                                              | 问题                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` 第 5、12、34、46、55 行               | 仍在宣传 **Quackback AI**（hero alt、简介、Why 列表、What's inside 表格行、「bring your own email and AI providers」）；第 43 行 Support inbox 仍写 `workflows` |
| `.github/readme/hero-light.svg` / `hero-dark.svg` | `<title>`/`<desc>`/可见文字含「Quackback AI」→ 需要改图或至少改 alt/title                                                                                       |
| `docs/security.md` 第 12–16 行                    | 整节「AI & Connectors」描述已删除的 AI 写工具与审批策略                                                                                                         |
| `docs/live-chat-ai-design.md`                     | 整篇（45 处 AI 引用）是已删 AI 层的设计稿，且文中引用的 `domains/ai/*`、`domains/embeddings/*`、`domains/summary/*` 都不存在了 → 删                             |
| `deploy/README.md`                                | 仍有「Quackback Cloud」章节、目录树里的 `edge/`（**该目录已不存在**）、以及「the same build runs self-hosted and on Cloud」                                     |
| `server.json`                                     | 42 条 MCP 工具声明里有 3 条已不存在：`accept_suggestion` / `dismiss_suggestion` / `restore_suggestion`；`version` 仍是 1.0.0（包是 0.15.0）                     |
| `docs/configuration.md`                           | 见 P4.2                                                                                                                                                         |
| `apps/web/src/lib/server/workspaces/TENANCY.md`   | 若做 P2，整份删除                                                                                                                                               |

**防回潮**：`apps/web/src/lib/server/__tests__/no-cloud-residue.test.ts` 已经存在且有效，但它只扫 `apps/web/src`，且只覆盖云层。建议扩成一张「已移除功能清单」：

```ts
// retired-features.ts（建议）
FORBIDDEN = [
  'getCloudConfig(',
  'requireEntitlement(',
  'startTelemetry(',
  'emitPlgEvent(',
  'isPooledTenancy(',
  'lookupWorkspaceByHost(',
  'WorkspaceKeyedCache',
  'domains/assistant/',
  'domains/ai/',
  'domains/billing/',
  'domains/embeddings/',
  'domains/merge-suggestions/',
  'lib/shared/assistant/',
  'packages/widget',
]
```

并让扫描范围覆盖 `apps/web/{src,scripts,e2e,perf,evals}` 与 `packages/`。这样下一次 merge 上游时，第一条没删干净的分支会先红。

---

## 6. 重构清单（P6，与移除解耦）

### 6.1 巨型文件（重构优先级最高的 12 个）

|          行数 | 文件                                                             | 建议                                                                      |
| ------------: | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
|         2,672 | `components/ui/rich-text-editor.tsx`                             | 拆 extensions / toolbar / paste / markdown / image 子模块                 |
|         2,598 | `components/conversation/agent-conversation-thread.tsx`          | 与 visitor 线程共用骨架（见 6.2）                                         |
|         2,054 | `lib/server/events/targets.ts`                                   | 按收件人类型（team / mention / watcher / email / webhook）拆文件 + 注册表 |
|         1,901 | `domains/conversation/conversation.service.ts`                   | 拆 send / status / assign / merge 子服务                                  |
|         1,722 | `lib/server/auth/hooks.ts`                                       | 拆 signup gate / session / MFA / audit                                    |
|         1,709 | `domains/conversation/conversation.query.ts`                     | 拆 admin / visitor / ticket 查询面                                        |
|         1,478 | `routes/admin/inbox.tsx`                                         | 页面逻辑下沉到 hooks / 组件                                               |
|         1,452 | `components/auth/portal-auth-form-inline.tsx`                    | 与 portal auth 复用                                                       |
|         1,434 | `lib/server/functions/conversation.ts`                           | 40 个 server fn 按子域拆                                                  |
|         1,431 | `lib/server/storage/s3.ts`                                       | 拆 sign / proxy / namespace / legacy                                      |
|         1,379 | `components/shared/conversation/visitor-conversation-thread.tsx` | 见 6.2                                                                    |
| 1,294 / 1,272 | `policy/module-state/{ledger,scan}.ts`                           | 随 P2 一起处理（或缩成通用静态状态审计）                                  |

次一级：`functions/admin.ts`（1,257）、`functions/tickets.ts`（992）、`functions/status.ts`（863）、`functions/help-center.ts`（572），各含 32–47 个 server fn；`settings.service.ts`（1,130）、`settings.types.ts`（1,119）、`routes/api/v1/docs.ts`（1,139，内联 OpenAPI 文案）、`integration-settings-registry.tsx`（1,028）、`identity-providers.service.ts`（997）、`status.service.ts`（1,115）、`user-detail.tsx`（980）。

### 6.2 重复实现

| 重复                                                                            | 证据                                                                                                                                              | 建议                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 两套会话线程                                                                    | `agent-conversation-thread`(2,598) + `visitor-conversation-thread`(1,379)，共享 `thread.tsx`(327) 与 `message-bubble`(904)                        | 统一成一个 `ConversationThread`，surface 只传 capability、composer、audience，复用共享壳   |
| 集成设置 UI 重复                                                                | `ui/*-config.tsx` 18 个近重复文件（UI 共 46 文件 / 5,282 行）；`handleEnabledChange` 18 份、`handleEventToggle` 17 份、`handleProjectChange` 4 份 | 抽共享 `IntegrationConfigCard`（连接/事件/字段三段），provider 只声明 catalog + 字段       |
| 15 份 `server/oauth.ts`（+ `_template`）、5 份 `server/webhook-registration.ts` | 25 个 provider 目录                                                                                                                               | 抽统一 OAuth/webhook 注册器，provider 只给 endpoints                                       |
| 统计工具                                                                        | `toIsoDay` ×4（analytics 域）、`isRecord` ×6、`domainOf` ×4                                                                                       | 收进 `lib/shared/utils`                                                                    |
| 三套 API 校验                                                                   | `domains/api/schemas/*`（22 文件）、`functions/*` 的 zod、MCP tool 输入                                                                           | 让 REST/MCP/server fn 共用同一 schema 源，避免三处漂移                                     |
| `email-senders` 新栈 vs `channel-accounts/sending-*` 旧栈                       | 上游本轮新增 `sender-resolver.ts`（+284 行）、`email-senders.ts`（+184）、`sending-address.ts`（+84）…                                            | 合并完成后确认旧式 `sending-address` 是否只剩兼容用途，再做收敛（不要在 merge 中做）       |
| `domain-proof` 新旧两套                                                         | 旧：`hostname-proof.ts`/`proven-zones.ts`；新：`domains.service.ts`（+300）/`domains-overview.ts`/`ensure-domain.ts`（+38）                       | 统一 ownership 记录为单一入口；`proven-zones` 与 `domains` 表的关系写进 CONTRACT.md 后再改 |

### 6.3 测试体系

- 1,753 个测试文件 / 284k 行，`ci.yml` 分 4 shard；`.db.test.ts` 150 个、依赖真实 Postgres。
- 建议：① 随 P1/P2 删除对应测试（预计 −120 文件）；② 把 36 个文件里的 `QUACKBACK_TENANCY` stub 收敛为一个 `withTenancy()` helper，P2 后整体消失；③ 清理 10 个死 mock；④ 组件测试与 e2e 的重叠（如 search palette 在 `ask-quackback.spec.ts` 与 `search-palette.test.tsx` 双测）逐步合并。

### 6.4 已核实无引用的死文件（可直接删）

| 文件                                              | 说明                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `lib/shared/moved-route.ts`                       | `redirectMoved()` 0 引用（旧页面 redirect stub 已随页面删除）            |
| `lib/server/personal-email-domains.ts`            | 只是 `@quackback/db/email/personal-email-domains` 的 re-export，0 导入方 |
| `components/admin/ask/settings-proposal-cache.ts` | 0 引用（名字里的 proposal 是 AI 设置提案的残留）                         |
| `domains/office-hours/reply-time-message.ts`      | 0 引用                                                                   |
| `domains/api-keys/admin-token-auth.ts`            | 0 引用（`ADMIN_API_TOKEN` 走别的路径）                                   |

另：`apps/web/src/lib/server/domains/api/schemas/*`（22 文件）在静态 import 图里无引用，但它们是 OpenAPI 生成/文档用的动态入口，**不要**按死文件删，先确认生成脚本的加载方式。

### 6.5 类型与规范

- 303 处 `any`（非测试），集中在 `events/targets.ts`、`storage/s3.ts`、`conversations` 的 DTO 边界；建议配合 6.1 的拆分逐个收紧，而不是一次性 `no-explicit-any`。
- `routeTree.gen.ts`（5,922 行）与 `MATRIX.md`/`GRAPH.md`/`CONTRACT.md`/`MODULE-STATE.md`/`platform-schema.generated` 全部是生成物：**只允许脚本生成**，每批结束跑一次并检查 diff 只包含本批变化。

---

## 7. 批次、顺序与估工

| 批次   | 内容                                                               | 估工   | 风险                            | 依赖                                   |
| ------ | ------------------------------------------------------------------ | ------ | ------------------------------- | -------------------------------------- |
| **P0** | 收尾 merge（32 冲突 + journal + 去云改写新 Domains 页）            | L      | **高**（当前不可构建/不可迁移） | —                                      |
| **P1** | AI/工作流残骸：evals/scripts/workflow 权限与事件/10 个死 mock/依赖 | L      | 低                              | 与 P0 无依赖，但建议 P0 后做，避免冲突 |
| **P2** | 多租户栈：workspaces/fleet/probe/module-state + 45 个消费点        | **XL** | 中高                            | 需先确认「永不做多 workspace」         |
| **P3** | PostHog 产品分析                                                   | S      | 低                              | —                                      |
| **P4** | DB/配置/文案/语言包残留                                            | M      | 低（迁移需评审）                | P1 之后（权限与表一起删）              |
| **P5** | README/docs/deploy/server.json/hero                                | S      | 无                              | P1–P3 完成后一次改                     |
| **P6** | 重构（巨型文件/重复实现）                                          | XL     | 中                              | 独立主线，不要和移除混做               |
| **P7** | 生成物重生成 + 全量验证 + 防回潮 guard                             | M      | 低                              | 全部之后                               |

建议 PR 粒度：P0 一个（必须单独评审）；P1 拆 3 个（死资产 / 工作流残骸 / 权限与事件）；P2 拆 4–5 个（probe → module-state → fleet → workspaces 消费点 → 删目录）；P3 一个；P4 拆 2 个（DB+权限，文案+语言包）；P5 一个；P6 每个重构单独 PR。

---

## 8. 验收与防回潮

每批结束至少跑：

```bash
bun run lint
bun run typecheck                      # 含 workspace-probe；P2 删 probe 后要同步改根脚本
bun run --cwd apps/web check:server-fn-manifest
bun run db:migrate && bun run db:check-drift
bun run build
bun run test --run --shard=1/4 --reporter=dot   # 全量约 10 分钟，CI 分 4 shard
```

定向验收：

| 批次 | 断言                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | `node -e "JSON.parse(require('fs').readFileSync('packages/db/drizzle/meta/_journal.json','utf8'))"` 通过；`git diff --name-only --diff-filter=U` 为空；全仓 `<<<<<<<` 0 命中；`cloud-identity | ensureBillingCatalogue                        | hasCustomDomainEntitlement` 0 命中                                                                                                                             |
| P1   | `evals/`、`backfill-ai.ts`、`assistant-evals.yml` 不存在；`domains/assistant                                                                                                                  | domains/ai/                                   | domains/embeddings                                                                                                                                             | domains/merge-suggestions` 0 命中；`automation.` 代码引用 0 |
| P2   | `workspaces/`、`fleet/`、`workspace-probe/`、`module-state/` 不存在；`QUACKBACK_TENANCY                                                                                                       | QUACKBACK_CONTROL_DATABASE_URL                | QUACKBACK_FLEET_ROOT_KEY` 只出现在迁移/历史注释；`isPooledTenancy` 0 命中；单 workspace 冷启动 + 登录 + 建 board + 发帖 + 收件箱 + changelog + status 手工冒烟 |
| P3   | `posthog                                                                                                                                                                                      | POSTHOG`0 命中（除`.env` 本地文件）           |
| P4   | `automation.` 语言键 0；`SUGGESTION_                                                                                                                                                          | WORKFLOW_MANAGE` 0；`en/zh-cn/zh-tw` 键数一致 |
| P5   | `README` 无 `Quackback AI`；`docs/live-chat-ai-design.md` 不存在；`server.json` 工具集 = 代码注册集                                                                                           |

防回潮：把 `no-cloud-residue.test.ts` 升级为 `no-retired-feature-residue.test.ts`（见第 5 节），并把扫描范围从 `src` 扩到 `scripts/e2e/perf/evals/packages`。

---

## 9. 红线：这些「看起来像云」，但必须保留

| 模块                                                                          | 为什么留                               |
| ----------------------------------------------------------------------------- | -------------------------------------- |
| `lib/server/config-file/`、`settings.tier_limits`、`managed_field_paths`      | 自托管声明式配置 + operator 配额       |
| `lib/server/fleet/internal-auth.ts`、`jobs/wake.ts`、`/api/internal/job-wake` | 自托管 web/worker 拆分部署的唤醒       |
| `lib/server/cron/fleet-jobs.ts`                                               | 自托管的定时清扫（改名即可）           |
| `domains/{audit,sso,webhooks,api-keys}`                                       | 自托管安全/企业/开发者能力             |
| `domains/subscriptions/`                                                      | 邮件订阅退订令牌，**不是**计费订阅     |
| `tierLimits` 数值字段                                                         | operator 主动设置的上限                |
| `MCP`、`REST v1`、`import/export`、`push-devices`、`visitor-analytics`        | 产品能力，不是云                       |
| `sso_recovery_code` 表 + 恢复码 UI                                            | 活跃功能（SSO break-glass），不要误删  |
| `apps.tsx` + `routes/api/v1/apps/*` + Zendesk sidebar                         | Zendesk 集成的前端 iframe 面，产品功能 |
| `conversations.source='widget'` 等历史值                                      | 老数据兼容                             |

---

## 10. 待确认决策

1. **merge**：继续解决（推荐）还是 abort 后改为 cherry-pick Domains/Email 两个功能？前者保留 227 个已 staged 的文件，后者更干净但重做量大。
2. **多租户（P2）**：确认「一个自托管实例 = 一个 workspace，永不做 pooled」？这是 P2 的前提；不确认就跳过 P2，先做 P1/P3/P4。
3. **`module-state` 策略**：随 P2 整块删（约 2,800 行实现 + 302 行文档），还是保留扫描器、只删 workspace 专用的 45 条 + fleet-wide 16 条 ledger 条目？
4. **PostHog**：删（推荐）还是保留为可选自建？
5. **`config-file`**：保留（推荐，自托管能力）还是也删（764 + 916 行 + 19 个引用点）？
6. **`widget.` i18n 命名空间**：重命名 `messenger.*`（推荐，纯改名）还是保持现状？
7. **工作流表**：直接 drop（推荐）还是先标记废弃、下个版本再 drop？
8. **重构主线**：P6 是否单独立项？如果先做，建议从 agent/visitor 两套线程和 18 个集成配置页开始（收益最大、风险最低）。

---

## 附录 A：32 个未合并路径（P0 原始清单）

**UU（16）**：`apps/web/perf/budgets.json`、`apps/web/perf/journeys.ts`、`src/components/admin/settings/email-channel-page.tsx`、`src/lib/server/domains/domain-proof/{proven-zones.ts,__tests__/hostname-proof.db.test.ts,__tests__/proven-zones.db.test.ts}`、`src/lib/server/fleet/__tests__/migrator-gate.test.ts`、`src/lib/server/jobs/JOBS.md`、`src/lib/server/policy/authz-matrix/{MATRIX.md,classifications.ts}`、`src/lib/server/policy/dep-graph/GRAPH.md`、`src/lib/server/policy/migration-contract/CONTRACT.md`、`src/lib/server/policy/module-state/MODULE-STATE.md`、`src/lib/shared/settings-nav-sections.ts`、`src/routes/admin/settings.domains.tsx`、`packages/db/drizzle/meta/_journal.json`

**DU（16）**：`src/components/admin/settings/{domains-cards.tsx,__tests__/domains-card.test.tsx}`、`src/lib/server/functions/{cloud-identity.ts,__tests__/cloud-custom-domain.test.ts}`、`src/lib/server/domains/help-center/__tests__/help-center-domain-entitlement.test.ts`、`src/lib/server/mcp/__tests__/ask-golden-sdk.db.test.ts`、`src/locales/{ar,de,es,fr,nl,pl,pt-br,ru,th,uk}.json`

## 附录 B：证据复现命令

```powershell
git status --porcelain                                   # 32 个 U* 路径
git diff --name-only --diff-filter=U
git log --oneline -12 MERGE_HEAD
git diff --stat 19a6552df d84d1cb8e                      # 242 files, +16044/−2236
git ls-tree -d --name-only MERGE_HEAD -- apps/web/src/lib/server/domains/ai packages/widget

# 测量（Windows / pwsh）
Get-ChildItem apps/web/src -Recurse -File -Include *.ts,*.tsx   # 体量
Select-String -Path apps/web/src/locales/en.json -Pattern '"automation\.'   # 173
Select-String -Path packages/db/drizzle/meta/_journal.json -Pattern '^<<<<<<<'  # 冲突标记
```
