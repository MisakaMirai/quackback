# 前台 i18n 完整化改造方案（确认稿）

> 日期：2026-11-11
> 范围：门户 Portal、Widget、前台认证/邀请/CSAT/OAuth/退订、前台独立错误页
> 不包含：Admin 后台、邮件正文、用户生成内容（帖子、评论、帮助文章）
> 结论：语言包当前为 13 个语言 × 2264 个 key（基线 `fa9487b60`）；本次已落地 P1 的共享组件部分（12 个组件、17 个 key，语言包 2281）。
>
> 实施状态（2026-11-11）：编辑器、错误页、reaction chip、删除帖子对话框的 P1 改动已按评审回退，不在本次提交中；下文相关章节保留为后续计划。P0 中关于 `/csat`、`/complete-signup` 已调用 `useIntl` 的判断基于审计基线 `ae59ac770`，需要在当前 main 上重新复核。

---

## 0. 先看结论

这次审计发现四类问题，按严重程度排列：

| 级别   | 问题                                                              | 后果                                                                                   | 数量                             |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| **P0** | 页面调用了 `useIntl()`，但祖先没有 `IntlProvider`                 | 渲染时抛 `Could not find required intl object`，被 error boundary 接住就显示通用错误页 | 2 个页面                         |
| **P0** | 页面有 Provider，但语言被写死成 `DEFAULT_LOCALE` 或没有加载语言包 | 永远显示英文                                                                           | 2 个页面                         |
| **P1** | 前台路由/组件完全没接入 i18n，硬编码英文                          | 非英文用户看到英文                                                                     | 约 10 个页面/组件，约 200 条文案 |
| **P2** | `<head>` 标题/描述、JSON-LD、Widget SDK 的 aria 文本没本地化      | 浏览器标签、分享卡片、屏幕阅读器仍是英文                                               | 约 20 条                         |

---

## 1. 审计方法与范围

### 1.1 已确认的事实

- `apps/web/src/locales/` 下有 13 个语言包：`en`、`de`、`fr`、`es`、`ar`、`ru`、`pt-br`、`zh-cn`、`zh-tw`、`nl`、`pl`、`th`、`uk`。
- 当前基线每个语言包都是 **2264 个 key**（本次 P1 共享组件部分后 2281 个），键集合完全一致；`locale-parity.test.ts` 会强制这一点。
- 所有已用 `intl.formatMessage({ id, defaultMessage })` / `<FormattedMessage>` 写出的文案，`default-messages.test.ts` 会强制与 `en.json` 逐字一致。
- 全库没有任何"根级" `IntlProvider`。Provider 只挂在：`_portal.tsx`、`admin.tsx`、`onboarding.tsx`、`auth.recovery.tsx`、`auth.reset-password.tsx`、`unsubscribe.tsx`、`device.tsx`、`oauth/consent.tsx`、`widget.tsx`（在 `WidgetAuthProvider` 内）、`AreaMessages`。
- 用 `useIntl` 在无 Provider 环境下做最小运行时验证，会抛：
  `[React Intl] Could not find required intl object. <IntlProvider> needs to exist in the component ancestry.`

### 1.2 扫描方式

- 用 Babel AST 扫描 `apps/web/src` 全部 3082 个源码文件，识别：
  - JSX 纯文本；
  - `placeholder` / `title` / `aria-label` / `alt` 等属性；
  - `label` / `title` / `description` / `message` 等对象字段；
  - 模板字符串里的英文片段。
- 再用 import 闭包从 58 个前台路由入口反向找可达组件，排除 admin / api / onboarding 页面。
- 扫描是启发式的，最终清单经过人工复核；下面列出的都是确认项，不包含 className、URL、meta 属性名、测试文件等误报。

### 1.3 范围定义

"前台"按以下入口计算：

- 门户：`routes/_portal.tsx` 及其子路由、`components/public/`、`components/portal/`、`components/help-center/`、`components/settings/`（门户设置页）
- Widget：`routes/widget.tsx`、`routes/widget/index.tsx`、`components/widget/`、`packages/widget/`（SDK 外壳）
- 认证/邀请：`routes/auth.*`、`routes/complete-signup.$id.tsx`、`routes/verify-magic-link.tsx`、`routes/portal-invite.$inviteId.tsx`、`routes/csat.tsx`、`routes/oauth/consent.tsx`、`routes/unsubscribe.tsx`、`routes/device.tsx`
- 共享组件：`components/shared/`、`components/ui/`、`components/conversation/` 中**被前台 import 的部分**

不翻译：用户生成内容、工作区名称、板块/状态/标签名称、邮箱地址、URL、代码、品牌名（Quackback、Copilot 等按现有语言包约定处理）。

---

## 2. P0：现有"已本地化"页面的接线错误（必须先修）

### 2.1 `/csat` 与 `/complete-signup/$id` 缺少 `IntlProvider`

| 文件                                          | 证据                                                    | 说明                                                                                                |
| --------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/csat.tsx`                | `:12` 引入 `useIntl`，`:57`、`:221` 调用                | 路由模块内没有 `IntlProvider`，祖先也没有；`csat.*` 的 15 个 key 在语言包里存在，但页面根本渲染不到 |
| `apps/web/src/routes/complete-signup.$id.tsx` | `:4` 引入 `useIntl`，`:63`、`:163`、`:231`、`:443` 调用 | 同上；`completeSignup.*` 的 27 个 key 存在但没被加载                                                |

**影响**：访问 `/csat?token=...` 或邀请注册页会抛错。如果路由 error boundary 接住，用户看到的是通用错误页，而不是评分页/注册页。

**修法**：

1. 在 loader 中解析语言并只加载该页需要的切片：
   ```ts
   const locale = await getPortalLocaleFn()
   const messages = await loadAreaMessages(locale, 'csat') // 或 'completeSignup'
   ```
2. 路由组件外包一层 `PortalIntlProvider locale={locale} messages={messages}`。
3. 在 `AREA_MESSAGE_PREFIXES` 中新增 `csat: ['csat.']`、`completeSignup: ['completeSignup.']`，避免这些 key 被 `adminSeedMessages` 重复带进后台页面。
4. 把 `/csat`、`/complete-signup/$id` 加入 `document-locale.ts` 的 `LOCALIZED_ROUTE_IDS`，否则 `<html lang>` 仍是 `en`，阿拉伯语页面不会 RTL。

### 2.2 `/oauth/consent` 语言被写死

| 文件                                    | 证据                                                 | 说明                                                                                             |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web/src/routes/oauth/consent.tsx` | `:42` `<PortalIntlProvider locale={DEFAULT_LOCALE}>` | 永远 `en`，且没有传 `messages`；15 个 `oauth.consent.*` key 在所有语言包中都有，但永远不会被用上 |

**修法**：

1. 给路由加 loader：`const { locale, messages } = await loadOAuthConsentIntl()`。
2. 把 `locale={DEFAULT_LOCALE}` 改为 loader 返回的 `locale`，并传 `messages`。
3. 新增 `oauthConsent: ['oauth.consent.']` 到 `AREA_MESSAGE_PREFIXES`。
4. 加入 `LOCALIZED_ROUTE_IDS`。

### 2.3 私有门户 gate 首屏仍是英文

| 文件                                                    | 证据                                                               | 说明                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `apps/web/src/routes/_portal.tsx`                       | `:160` 只取了 `locale`，`:176-197` 的 gate payload 没有 `messages` | gate 的 `<PortalIntlProvider>` 没有 SSR 语言包，只能等客户端 `loadMessages` |
| `apps/web/src/components/portal/portal-access-gate.tsx` | `:579` `<PortalIntlProvider locale={locale ?? DEFAULT_LOCALE}>`    | 首屏英文，随后才切到目标语言；登录墙是私有门户的第一屏，闪烁明显            |

**修法**：gate 分支里 `const messages = await loadPortalMessages(locale)`，随 `gate` 一起返回并传给 `PortalIntlProvider`。`loadPortalMessages` 已包含 `portal.accessGate.*`、`portal.auth.*`，不需要新 key。

### 2.4 独立认证页完全没接入

| 路由                       | 文件                                              | 现状                                                                                        |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/verify-magic-link`       | `apps/web/src/routes/verify-magic-link.tsx`       | 零 i18n import；`:31-38`、`:104`、`:114-115`、`:121`、`:125`、`:189`、`:200-202` 全是裸英文 |
| `/portal-invite/$inviteId` | `apps/web/src/routes/portal-invite.$inviteId.tsx` | `:104-145` 的 `getMessage()` 7 个状态全是硬编码；`:97` "Go to portal" 也没本地化            |
| `/auth/auth-complete`      | `apps/web/src/routes/auth.auth-complete.tsx`      | 零 i18n；`:64`、`:70-71`、`:77-82` 全是裸英文；`:79` 还直接读英文的 `AUTH_BLOCK_MESSAGES`   |
| `/auth/widget-handoff`     | `apps/web/src/routes/auth.widget-handoff.tsx`     | 零 i18n；`:374-378` 错误页裸英文                                                            |

**统一修法**：为每个路由加 loader（返回 `locale` + 对应 area 的 `messages`），组件外包 `PortalIntlProvider`，所有文案改为 `useIntl().formatMessage({ id, defaultMessage })`。新增 area：

```ts
verifyMagic: ['auth.verifyMagic.'],
portalInvite: ['portal.invite.'],
authComplete: ['auth.authComplete.'],
widgetHandoff: ['auth.widgetHandoff.'],
```

`auth-complete` 还需要同时加载 `auth.blockMessage.*`（见 3.1），建议用 `loadMessagesByPrefixes(locale, ['auth.authComplete.', 'auth.blockMessage.'])` 这类通用 helper，而不是硬编码两个 slice。

### 2.5 `/widget` 的 errorComponent 在 Provider 外

| 文件                             | 证据       | 说明                                                                                                   |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web/src/routes/widget.tsx` | `:141-154` | `WidgetErrorComponent` 渲染时 `WidgetAuthProvider` 已经被 error boundary 替换，`useIntl` 没有 Provider |

**修法**：拆成两层。外层从 `Route.useLoaderData({ strict: false })` 拿 `locale`/`messages`（拿不到时回退到 `DocumentLocaleContext` 或 `DEFAULT_LOCALE`），包一层 `PortalIntlProvider`；内层再 `useIntl`。`widget.error.*` 放在 `widget.` 前缀下，会被 `loadWidgetMessages` 正常带进 widget 切片。

### 2.6 认证错误码（33 条）仍是英文

| 文件                                                       | 证据       | 说明                                                                            |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `apps/web/src/lib/shared/auth-block-messages.ts`           | `:62-115`  | 33 个 `AuthBlockCode` 的英文文案                                                |
| `apps/web/src/components/auth/portal-auth-form-inline.tsx` | `:285-291` | 门户登录表单直接把 `AUTH_BLOCK_MESSAGES[code]` 塞进 `setError`，没有经过 `intl` |
| `apps/web/src/routes/auth.auth-complete.tsx`               | `:79`      | OAuth popup 同样直接读英文常量                                                  |

**修法**：

1. 保留常量作为"英文数据源"（类型安全，生产代码引用不变）。
2. 新增 33 个 `auth.blockMessage.<code>` key，`en.json` 的 value 与常量逐字一致。
3. 消费处统一走 helper：
   ```ts
   intl.formatMessage({
     id: `auth.blockMessage.${code}`,
     defaultMessage: AUTH_BLOCK_MESSAGES[code],
   })
   ```
4. 把 `auth.blockMessage.` 加入 `PORTAL_MESSAGE_PREFIXES`，让门户登录表单的每个页面都能拿到；`auth-complete` 用 2.4 的 prefix helper 单独加载。

> 注意：`AuthBlockCode` 里有一个带撇号的 `email_doesn't_match`。如果不想让 message id 带撇号，可在 helper 里把它映射成 `email_doesnt_match`，但 `en.json` key 和代码必须保持一致，`default-messages.test.ts` 会校验。

---

## 3. P1：前台可见硬编码清单

### 3.1 富文本编辑器 `apps/web/src/components/ui/rich-text-editor.tsx`（约 80 条）

这是前台最大的一块：门户评论框、发帖框、Widget 发帖/回复都用它，且 `COMMENT_EDITOR_FEATURES` 打开了完整工具栏、斜杠菜单、表格、图片、视频、嵌入。

| 区域                | 行号                                                             | 文案                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 斜杠菜单项标题/描述 | `:620-841`                                                       | Text / Plain paragraph text；Heading 1-3；Bullet List；Numbered List；Checklist；Quote；Divider；Code Block；Image；Video；Table；YouTube，共 14 项 × 2                       |
| 斜杠菜单空态        | `:954`                                                           | No matching commands                                                                                                                                                          |
| 斜杠菜单分组        | `:962-967`                                                       | Text / Lists / Blocks / Advanced（扫描器漏掉了后三个，人工补）                                                                                                                |
| 表情选择            | `:1245`、`:1248`                                                 | Recent / Popular                                                                                                                                                              |
| 图片右键菜单        | `:1807-1824`                                                     | View image / Download / Copy to clipboard / Copy link / Delete                                                                                                                |
| 工具栏 tooltip      | `:2192-2221`、`:2736-2856`                                       | Bold / Italic / Underline / Strikethrough / Inline Code / Insert Link / Heading 1-3 / Bullet List / Ordered List / Code Block / Insert Image / Insert Video / Undo / Redo     |
| 链接气泡            | `:2265`、`:2299`                                                 | Insert Link / Remove link                                                                                                                                                     |
| 表格工具栏          | `:2320-2323`、`:2392-2447`                                       | Text / Heading 1-3；Add row above/below；Add column left/right；Delete row/column/table                                                                                       |
| 图片工具栏          | `:2545-2581`                                                     | Image options；View image / View image in new tab；Download / Download image；Copy to clipboard / Copy image to clipboard；Copy link / Copy image link；Delete / Delete image |
| 嵌入/视频节点       | `quackback-embed-extension.tsx:43`、`uploaded-video-node.tsx:23` | Remove embed / Remove video                                                                                                                                                   |

**建议 key 命名**：统一放 `ui.editor.*`，这样不用改 `PORTAL_MESSAGE_PREFIXES`（`ui.` 已在允许列表里）。

- `ui.editor.slash.<item>.title` / `.description`
- `ui.editor.slash.group.text|lists|blocks|advanced`
- `ui.editor.slash.empty`
- `ui.editor.emoji.recent|popular`
- `ui.editor.image.*`
- `ui.editor.table.*`
- `ui.editor.link.*`
- `ui.editor.menu.<action>`
- `ui.editor.embed.remove`、`ui.editor.video.remove`

**实现注意**：

- 斜杠菜单的 `getSlashMenuItems()` 在 React 渲染外构造，不能直接 `useIntl`。建议把 `title`/`description` 改成 message id（或 `{ id, defaultMessage }` 描述符），在 `SlashMenuList` 里用 `useIntl` 格式化；不要把 `intl` 塞进 `useEditor` 的依赖，否则切换语言会重建编辑器、丢草稿。
- 工具栏快捷键建议用 `{shortcut}` 参数（如 `Bold ({shortcut})`），由组件根据平台传 `Cmd+B` / `Ctrl+B`，不要为每个平台各写一条 key。
- `Insert Link` 的 URL placeholder `https://example.com` 不需要翻译。

### 3.2 门户共享组件

| 文件                                                                 | 行号                   | 文案 / 问题                                                                                                                                     | 建议 key                                                                                                          |
| -------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `components/shared/status-dropdown.tsx`                              | `:54`、`:73`           | `No status` / `No Status`（公共帖子卡片、元数据侧栏可见）                                                                                       | `portal.post.noStatus`                                                                                            |
| `components/shared/reaction-chip.tsx`                                | `:5-13`                | `1 reaction`、`N reactions`、`... and N more`（门户评论、Widget 评论的 tooltip）                                                                | `portal.reaction.count`（ICU plural）、`portal.reaction.andMore`；人名列表用 `intl.formatList`                    |
| `components/shared/filter-chip.tsx`                                  | `:180`                 | `Remove ${label} ${value} filter`（门户筛选条的 aria-label）                                                                                    | `portal.filter.removeAria`                                                                                        |
| `components/public/vote-button.tsx`                                  | `:124`                 | readonly 状态下 `aria-label` 为 `${displayCount} votes`                                                                                         | `portal.postCard.vote.ariaCount`（复数）                                                                          |
| `components/ui/mention-hover-card-overlay.tsx`                       | `:266-267`、`:281-286` | `${teamBadgeLabel} Member`；`Joined {date}`；日期用 `toLocaleDateString(undefined, ...)` 而非 `IntlProvider` 的 locale                          | `portal.mention.teamMemberAria`、`portal.mention.joined`；日期改用 `intl.formatDate` 或 `LocalDate`               |
| `components/shared/inline-moderation-actions.tsx`                    | `:37-55`               | Pending review / Customers cannot see this {noun} yet. / Approve / Reject（门户待审帖子/评论）                                                  | `portal.moderation.pending`、`.hiddenFromCustomers`、`.approve`、`.reject`                                        |
| `components/shared/error-page.tsx`                                   | `:132-150`、`:178-189` | 权限页与套餐页的标题、说明、按钮全是硬编码                                                                                                      | `common.errorPage.permission.*`、`.plan.*`                                                                        |
| `components/settings/notification-matrix-form.tsx`                   | `:325-338`             | `Setup tips` / `Emails with the next step...` / `aria-label="Setup tips by email"`（门户偏好设置）                                              | `portal.settings.notifications.tips.*`                                                                            |
| `components/shared/conversation/block-ticket-form.tsx`               | `:44-45`               | 失败 toast 的 fallback `Failed to create ticket`（门户支持/Widget 对话卡片）                                                                    | `widget.tickets.blockCard.createFailed`                                                                           |
| `components/public/post-detail/delete-post-dialog.tsx`               | `:178-191`             | `(disconnected)`、`(reference only)`、`Review ... for closing/archiving`、`: integration disconnected...`、`: manage this item directly on ...` | `portal.postDetail.deleteDialog.cascade.*`；`getIntegrationActionVerb`/`ItemNoun` 的 Archive/issue 需要一并参数化 |
| `components/ui/select.tsx`                                           | `:233`                 | `aria-label="Clear"`（门户筛选/表单共用）                                                                                                       | `common.a11y.clear`                                                                                               |
| `components/ui/breadcrumbs.tsx`、`components/shared/page-header.tsx` | `:26`、`:44`           | `aria-label="Breadcrumb"`                                                                                                                       | `common.a11y.breadcrumb`                                                                                          |

> `components/shared/portal-user-picker.tsx`、`author-selector.tsx`、`modal-header/footer.tsx`、`emoji-picker.tsx`、`state-badge.tsx`、`filter-presets.ts`、`dns-record-table.tsx`、`datetime-picker.tsx`、`color-picker.tsx` 目前只被 admin 引用，本次不处理。

### 3.3 门户错误页的 Provider 缺口

`components/shared/error-page.tsx` 的 `ErrorPageCopy` 在没有 `IntlContext` 时直接返回英文（`:40-44`）。而根路由的 `errorComponent` / `notFoundComponent` 渲染在任何 Provider 之上，所以门户的 404/错误页即使 `DocumentLocaleContext` 是 `zh-cn` / `ar`，仍然是英文。

**修法**：`ErrorPageCopy` 在 `!intl` 时自己挂一个轻量 Provider（用 `DocumentLocaleContext` 的 locale + `loadAreaMessages(locale, 'errorPage')`），再渲染 `PageLanguage`。这样根级错误页也能本地化，且不依赖某个 layout 的 Provider。

### 3.4 装饰性 mock 是否需要翻译（待确认）

`components/portal/portal-access-gate.tsx:55-139` 的 `MOCK_NAV`、`MOCK_SORTS`、`MOCK_BOARDS`、`MOCK_POSTS` 是私有门户登录墙背后的模糊装饰内容，`aria-hidden`，不承载真实信息。它当前是英文（Feedback、Roadmap、Feature Requests、Dark mode for the dashboard...）。

**建议**：不翻译，保持"通用示意"；如果产品要求连装饰也本地化，再按 `portal.accessGate.mock.*` 补约 20 条 key。

---

## 4. P2：`<head>` 标题/描述与结构化数据

门户页面的 `<title>`、`description`、`og:*`、`twitter:*` 目前大多是硬编码英文。它们不在 React 渲染树里，不能用 `useIntl`，但 `head()` 能拿到 `matches`，可以从 `_portal` 的 loaderData 里取 `locale` 和 `messages`，用 `createIntl` 格式化。

### 4.1 需要改的路由

| 文件                                                   | 行号           | 当前硬编码                                                                                              | 建议 key                                                         |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `routes/_portal.tsx`                                   | `:288`         | `Sign in · ${workspaceName}`                                                                            | `portal.head.signInTitle`                                        |
| `routes/_portal.tsx`                                   | `:300`         | `Share feedback, vote on feature requests, and track the ${workspaceName} roadmap.`                     | `portal.head.description`                                        |
| `routes/_portal/index.tsx`                             | `:125-126`     | `Feedback - ${workspaceName}` / `Submit and vote on feature requests...`                                | `portal.head.homeTitle` / `.homeDescription`                     |
| `routes/_portal/roadmap.index.tsx`                     | `:44-45`       | `Roadmap - ${workspaceName}` / `See what ... is working on...`                                          | `portal.head.roadmapTitle` / `.roadmapDescription`               |
| `routes/_portal/changelog.index.tsx`                   | `:23-24`       | `Changelog - ${workspaceName}` / `Stay up to date...`                                                   | `portal.head.changelogTitle` / `.changelogDescription`           |
| `routes/_portal/changelog.$entryId.tsx`                | `:36-37`       | `${entryTitle} - ${workspaceName} Changelog` / `${entryTitle}. A product update from ${workspaceName}.` | `portal.head.changelogEntryTitle` / `.changelogEntryDescription` |
| `routes/_portal/status.index.tsx`                      | `:56-57`       | `Status - ${workspaceName}` / `Live status and incident history...`                                     | `portal.head.statusTitle` / `.statusDescription`                 |
| `routes/_portal/status.$incidentId.tsx`                | `:57-58`       | `${incidentTitle} - ${workspaceName} Status` / `${incidentTitle}. A status update...`                   | `portal.head.statusIncidentTitle` / `.statusIncidentDescription` |
| `routes/_portal/u.$principalId.tsx`                    | `:36`          | `${profile.displayName                                                                                  |                                                                  | 'Profile'} - ${workspaceName}` | `portal.head.profileTitle` + `portal.profile.anonymousName` |
| `routes/_portal/hc/$locale/articles/$idSlug/index.tsx` | `:145`         | JSON-LD 面包屑 `Help Center`                                                                            | `portal.hc.breadcrumbHome`                                       |
| `routes/_portal/hc/$locale/collections/$idSlug.tsx`    | `:207`         | 同上                                                                                                    | 同上                                                             |
| `routes/__root.tsx`                                    | `:119`、`:123` | 默认 `Quackback` / `Open-source customer feedback platform`                                             | 可选：`common.meta.defaultTitle` / `.defaultDescription`         |

### 4.2 实现方式

新增 `apps/web/src/lib/shared/portal-head.ts`（或放在 `components/public/`）：

```ts
import { createIntl } from 'react-intl'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'

export function portalHeadIntl(matches) {
  const portal = matches.find((m) => m.routeId === '/_portal')
  const data = portal?.loaderData as
    { locale?: string; messages?: Record<string, string> } | undefined
  return createIntl({
    locale: data?.locale ?? DEFAULT_LOCALE,
    messages: data?.messages ?? {},
    onError: () => {},
  })
}
```

然后：

```ts
head: ({ matches, loaderData }) => {
  const intl = portalHeadIntl(matches)
  const title = intl.formatMessage(
    { id: 'portal.head.homeTitle', defaultMessage: 'Feedback - {workspace}' },
    { workspace: loaderData.workspaceName }
  )
  ...
}
```

**注意**：

- `_portal.tsx` 自己的 gate 分支没有加载 `messages`，需要按 2.3 补上，否则 gate 的 `<title>` 仍然只能英文。
- 英文（`DEFAULT_LOCALE`）下 `messages` 是空对象，`formatMessage` 会回退到 `defaultMessage`，不需要额外加载语言包。
- 不要把 `createIntl` 放在模块顶层，否则语言/消息变化后不会更新。

### 4.3 其他格式化问题

| 文件                                                    | 行号                              | 问题                                                                                                                                        |
| ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/_portal/u.$principalId.tsx`                     | `:170`                            | MRR 用 `toLocaleString('en-US', ...)` 写死，非英文用户看到美式格式；改用 `intl.formatNumber(value, { style: 'currency', currency: 'USD' })` |
| `components/portal/status/status-incident-timing.tsx`   | `:31`、`:38`、`:44`、`:48`、`:50` | 时间后缀 `UTC` 是英文；建议用 `Intl.DateTimeFormat` 的 `timeZoneName: 'short'`，或加 `portal.status.utc`                                    |
| `components/portal/status/status-incident-timeline.tsx` | `:25`、`:32`                      | 已用 `locale` 格式化，但 `UTC` 同上                                                                                                         |

---

## 5. P3：Widget SDK 与可访问性

### 5.1 SDK 外壳字符串

`packages/widget/` 运行在宿主页面，不在 React Intl 里，但面向访客：

| 文件                                   | 行号                          | 文案                                                                                                                                 |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/widget/src/core/launcher.ts` | `:96`、`:207`、`:263`、`:303` | `Open feedback widget`、`Dismiss`、`Close feedback widget`                                                                           |
| `packages/widget/src/core/panel.ts`    | `:25-40`                      | `FRAME_TITLE` 只有 ar/de/es/fr/pl/pt/ru/uk/zh/zh-tw，缺 `nl`、`th`、`pt-br` 的显式项；`pt-br` 会走 `pt`，`nl`/`th` 回退成英文 `Help` |

**修法**：

1. 在 `launcher.ts` 里加一张 `LAUNCHER_LABELS: Record<locale, { open, close, dismiss }>`，与 `FRAME_TITLE` 同一模式；`createLauncher` 接收 `locale`，由 `index.ts`/`use-init.ts` 从配置传入。
2. 补全 `FRAME_TITLE` 的 `nl`、`th`，并确认 `pt-br` 的行为。
3. SDK 不引入 `react-intl`，避免包体增大；3 条字符串 × 13 语言可以接受。

### 5.2 其他 a11y 英文

- `components/ui/breadcrumbs.tsx`、`components/shared/page-header.tsx` 的 `Breadcrumb`。
- `components/ui/select.tsx` 的 `Clear`。
- 富文本编辑器的 `Insert emoji`、`Image options` 等。

这些都属于 P1/P2 的 key，不单独列。

---

## 6. 需要新增的基础设施

### 6.1 `lib/shared/i18n.ts`

新增 area（用于独立页面的切片加载）：

```ts
export const AREA_MESSAGE_PREFIXES = {
  // ...existing
  csat: ['csat.'],
  completeSignup: ['completeSignup.'],
  oauthConsent: ['oauth.consent.'],
  portalInvite: ['portal.invite.'],
  verifyMagic: ['auth.verifyMagic.'],
  authComplete: ['auth.authComplete.'],
  widgetHandoff: ['auth.widgetHandoff.'],
} as const
```

新增通用前缀加载 helper（供 `auth-complete` 同时加载两个前缀）：

```ts
export async function loadMessagesByPrefixes(
  locale: SupportedLocale,
  prefixes: readonly string[]
): Promise<Record<string, string>>
```

`PORTAL_MESSAGE_PREFIXES` 增加：

```ts
'auth.blockMessage.',
```

这样门户登录表单在每个门户页面都能显示已翻译的认证错误。

### 6.2 `lib/server/functions/locale.ts`

在 `loadPortalIntl` / `loadUnsubscribeIntl` 之外，新增：

```ts
export async function loadAreaIntl(area: MessageArea) {
  const locale = await getPortalLocaleFn()
  return { locale, messages: await loadAreaMessages(locale, area) }
}

export async function loadAuthCompleteIntl() {
  const locale = await getPortalLocaleFn()
  return {
    locale,
    messages: await loadMessagesByPrefixes(locale, ['auth.authComplete.', 'auth.blockMessage.']),
  }
}
```

### 6.3 `lib/shared/document-locale.ts`

`LOCALIZED_ROUTE_IDS` 增加：

```ts
'/csat',
'/complete-signup/$id',
'/oauth/consent',
'/portal-invite/$inviteId',
'/verify-magic-link',
'/auth/auth-complete',
'/auth/widget-handoff',
```

同时更新 `document-locale.test.ts` 里"这些页面保持 en"的断言。

### 6.4 独立页面的统一壳

建议加一个 `StandaloneIntlPage` 组件（或每个路由直接包 `PortalIntlProvider`）：

```tsx
function StandaloneIntlPage({ locale, messages, children }) {
  return (
    <PortalIntlProvider locale={locale} messages={messages}>
      {children}
    </PortalIntlProvider>
  )
}
```

不要包 `AreaMessages` 作为最外层：`AreaMessages` 自己调用 `useIntl()`，必须已有 Provider。

### 6.5 测试与守卫

| 测试                                                        | 需要做什么                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locales/__tests__/default-messages.test.ts`                | 不用改；新增的 `id + defaultMessage` 会自动被校验，`defaultMessage` 必须与 `en.json` 逐字一致                                                                                                                                                                              |
| `locales/__tests__/locale-parity.test.ts`                   | 新 key 必须同步 13 个语言包；否则 `%s defines every key present in en.json` 失败                                                                                                                                                                                           |
| `locales/__tests__/locale-vocabulary.test.ts`               | 新翻译不能含 em dash（`—`）；术语一致性                                                                                                                                                                                                                                    |
| `lib/shared/__tests__/document-locale.test.ts`              | 更新新增的本地化路由断言                                                                                                                                                                                                                                                   |
| `lib/shared/__tests__/portal-message-coverage.test.ts`      | 把 `components/ui/rich-text-editor.tsx`、`components/shared/reaction-chip.tsx`、`components/shared/filter-chip.tsx`、`components/shared/status-dropdown.tsx`、`components/public/vote-button.tsx` 等加入 `PORTAL_SOURCE_FILES`，确保新 key 在 `PORTAL_MESSAGE_PREFIXES` 内 |
| 新增 `locales/__tests__/frontend-hardcoded-strings.test.ts` | 静态扫描前台源码的 JSX 纯文本 + `placeholder/title/aria-label/alt`，有英文就失败；允许列表只放品牌名和装饰 mock                                                                                                                                                            |
| 新增 `routes/__tests__/standalone-intl-provider.test.ts`    | 读取顶层路由源码，凡是使用 `useIntl`/`FormattedMessage` 的，必须出现 `IntlProvider`/`PortalIntlProvider`/`WidgetAuthProvider`/`AreaMessages` 之一                                                                                                                          |

---

## 7. 新增 key 规划（约 200 条）

| 命名空间                                                      | 条数（约） | 用途                                                                                         |
| ------------------------------------------------------------- | ---------: | -------------------------------------------------------------------------------------------- |
| `ui.editor.*`                                                 |         80 | 斜杠菜单、工具栏、图片/表格/链接/嵌入                                                        |
| `auth.blockMessage.*`                                         |         33 | 登录错误码（加入 `PORTAL_MESSAGE_PREFIXES`，见 2.6）                                         |
| `auth.verifyMagic.*`                                          |         10 | Magic link 验证/邀请接收页                                                                   |
| `portal.invite.*`                                             |         13 | 门户邀请接受页                                                                               |
| `auth.authComplete.*`                                         |          5 | OAuth popup 完成页                                                                           |
| `auth.widgetHandoff.*`                                        |          3 | Widget handoff 失败页                                                                        |
| `widget.error.*`                                              |          2 | Widget iframe 错误页                                                                         |
| `portal.head.*`                                               |         15 | 门户 `<title>` / `description` / OG                                                          |
| `portal.*`（共享 UI）                                         |         20 | status / reaction / filter / vote / mention / moderation / notification tips / delete dialog |
| `common.errorPage.*`                                          |         10 | 权限页/套餐页                                                                                |
| `portal.hc.breadcrumbHome`、`portal.profile.anonymousName` 等 |          3 | JSON-LD、Profile 标题                                                                        |
| **合计**                                                      | **约 194** |                                                                                              |

说明：`csat.*`（15）、`completeSignup.*`（27）、`oauth.consent.*`（15）已经存在于 13 个语言包，**不需要新增**，只需要接线和切片加载。

---

## 8. 13 个语言包的同步策略

这是本次改造最容易被忽略的约束：

- `locale-parity.test.ts` 要求每个语言包都拥有 `en.json` 的全部 key。
- 该测试还要求每个语言包"真正翻译"了每条文案：与英文完全相同会被判定为未翻译，除非加入 `SAME_AS_ENGLISH` 允许列表。
- 因此**不能只加 `en.json` + `zh-cn.json`**；新增约 200 条 key 后，其余 11 个语言包必须同一批补齐，否则 CI 失败。

建议流程：

1. 先写 `en.json` 的 key 和英文原文（与代码 `defaultMessage` 逐字一致）。
2. `zh-cn.json` / `zh-tw.json` 人工翻译，作为术语基准。
3. 其余 11 个语言按现有术语表批量翻译；复用现有语言包里已有的词（例如 `portal.header.nav.roadmap`、`admin.nav.changelog`、`widget.*`），避免同一个词出现两种译法。
4. 跑 `locale-parity.test.ts`：
   - 缺 key：补；
   - placeholder 不一致：修；
   - 与英文相同：确认是借词/品牌词，加入 `SAME_AS_ENGLISH`；
   - 含 em dash：改掉。
5. 跑 `locale-vocabulary.test.ts`，确保 `admin.nav.changelog` 与 `portal.header.nav.changelog` 仍一致。

翻译时不要翻译：

- `Quackback`、`Quackback AI`、`Copilot`（按现有语言包约定）
- `Cmd+B` / `Ctrl+B` 等快捷键本身（只翻译 "Bold" 等动作名）
- URL、邮箱、代码
- 板块名、状态名、标签名（用户数据）

---

## 9. 文件改动清单（按批次）

### 批次 1：接线修复（不新增 key，可独立验证）

| 文件                                                        | 动作                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/web/src/routes/csat.tsx`                              | loader 返回 `locale/messages`，外包 `PortalIntlProvider`                       |
| `apps/web/src/routes/complete-signup.$id.tsx`               | 同上                                                                           |
| `apps/web/src/routes/oauth/consent.tsx`                     | 去掉 `DEFAULT_LOCALE`，loader 解析 locale + `oauth.consent` 切片               |
| `apps/web/src/routes/_portal.tsx`                           | gate 分支加载并传递 `messages`                                                 |
| `apps/web/src/components/portal/portal-access-gate.tsx`     | 接收 `messages` 并传给 `PortalIntlProvider`                                    |
| `apps/web/src/lib/shared/i18n.ts`                           | 新增 `csat` / `completeSignup` / `oauthConsent` area、`loadMessagesByPrefixes` |
| `apps/web/src/lib/server/functions/locale.ts`               | 新增 `loadAreaIntl`                                                            |
| `apps/web/src/lib/shared/document-locale.ts`                | 增加 `/csat`、`/complete-signup/$id`、`/oauth/consent`                         |
| `apps/web/src/lib/shared/__tests__/document-locale.test.ts` | 更新断言                                                                       |
| 新增 `routes/__tests__/standalone-intl-provider.test.ts`    | 防止再次出现"用 useIntl 但没 Provider"                                         |

### 批次 2：剩余独立页面 + 认证错误码（新增 key）

| 文件                                                       | 动作                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/routes/verify-magic-link.tsx`                | 全面接入 `useIntl` + Provider                                                                                                        |
| `apps/web/src/routes/portal-invite.$inviteId.tsx`          | `getMessage()` 改为 `intl.formatMessage`；Provider                                                                                   |
| `apps/web/src/routes/auth.auth-complete.tsx`               | 接入 i18n + Provider；错误码走 `auth.blockMessage.*`                                                                                 |
| `apps/web/src/routes/auth.widget-handoff.tsx`              | 接入 i18n + Provider                                                                                                                 |
| `apps/web/src/routes/widget.tsx`                           | `WidgetErrorComponent` 外包 Provider                                                                                                 |
| `apps/web/src/components/auth/portal-auth-form-inline.tsx` | 错误码走 `intl.formatMessage`                                                                                                        |
| `apps/web/src/lib/shared/auth-block-messages.ts`           | 常量保留，作为 `defaultMessage` 数据源                                                                                               |
| `apps/web/src/lib/shared/document-locale.ts`               | 增加剩余 4 个路由                                                                                                                    |
| `apps/web/src/locales/*.json`                              | 新增 `auth.verifyMagic.*`、`portal.invite.*`、`auth.authComplete.*`、`auth.widgetHandoff.*`、`widget.error.*`、`auth.blockMessage.*` |

### 批次 3：共享组件与富文本编辑器（新增 key）

| 文件                                                                                 | 动作                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| `apps/web/src/components/ui/rich-text-editor.tsx`                                    | 斜杠菜单、工具栏、图片/表格/链接/嵌入全部接入 |
| `apps/web/src/components/ui/quackback-embed-extension.tsx`                           | `Remove embed`                                |
| `apps/web/src/components/ui/uploaded-video-node.tsx`                                 | `Remove video`                                |
| `apps/web/src/components/shared/status-dropdown.tsx`                                 | `No status`                                   |
| `apps/web/src/components/shared/reaction-chip.tsx`                                   | 复数 + 人名列表                               |
| `apps/web/src/components/shared/filter-chip.tsx`                                     | `Remove ... filter` aria                      |
| `apps/web/src/components/public/vote-button.tsx`                                     | readonly `aria-label`                         |
| `apps/web/src/components/ui/mention-hover-card-overlay.tsx`                          | `Joined` / `Member` / 日期                    |
| `apps/web/src/components/shared/inline-moderation-actions.tsx`                       | 待审文案                                      |
| `apps/web/src/components/shared/error-page.tsx`                                      | 权限/套餐页 + 无 Provider 时的自举            |
| `apps/web/src/components/settings/notification-matrix-form.tsx`                      | Setup tips                                    |
| `apps/web/src/components/shared/conversation/block-ticket-form.tsx`                  | toast fallback                                |
| `apps/web/src/components/public/post-detail/delete-post-dialog.tsx`                  | 级联删除文案                                  |
| `apps/web/src/components/ui/select.tsx`、`breadcrumbs.tsx`、`shared/page-header.tsx` | a11y 文本                                     |
| `apps/web/src/lib/shared/__tests__/portal-message-coverage.test.ts`                  | 扩充扫描文件                                  |

### 批次 4：`<head>` / SEO

| 文件                                                                                                                                                                        | 动作                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 新增 `apps/web/src/lib/shared/portal-head.ts`                                                                                                                               | `portalHeadIntl(matches)`    |
| `routes/_portal.tsx`、`index.tsx`、`roadmap.index.tsx`、`changelog.index.tsx`、`changelog.$entryId.tsx`、`status.index.tsx`、`status.$incidentId.tsx`、`u.$principalId.tsx` | head 文案改用 intl           |
| `routes/_portal/hc/$locale/articles/$idSlug/index.tsx`、`collections/$idSlug.tsx`                                                                                           | JSON-LD 面包屑               |
| `routes/_portal/u.$principalId.tsx`                                                                                                                                         | MRR 格式化                   |
| `routes/__root.tsx`                                                                                                                                                         | 可选：默认 title/description |

### 批次 5：Widget SDK

| 文件                                                | 动作                    |
| --------------------------------------------------- | ----------------------- |
| `packages/widget/src/core/launcher.ts`              | aria 文案按 locale      |
| `packages/widget/src/core/panel.ts`                 | 补全 `FRAME_TITLE`      |
| `packages/widget/src/index.ts`、`react/use-init.ts` | 把 locale 传给 launcher |
| `packages/widget/__tests__/launcher.test.ts`        | 补 locale 断言          |

### 批次 6：语言包与回归测试

- 13 个 `apps/web/src/locales/*.json` 同步新增 key。
- 新增 `frontend-hardcoded-strings.test.ts`（可选，但强烈建议）。
- 跑完整 i18n 测试与 typecheck。

---

## 10. 验证方案

### 10.1 自动化

```bash
bun run typecheck
bunx vitest run apps/web/src/locales/__tests__/default-messages.test.ts \
  apps/web/src/locales/__tests__/locale-parity.test.ts \
  apps/web/src/locales/__tests__/locale-vocabulary.test.ts \
  apps/web/src/lib/shared/__tests__/document-locale.test.ts \
  apps/web/src/lib/shared/__tests__/portal-message-coverage.test.ts
bun run --cwd packages/widget typecheck
bun run --cwd packages/widget test
```

> 当前沙箱环境无法启动 vitest 子进程（`spawn EPERM`），以上命令需要在正常终端执行。本文档的结论来自静态扫描和最小 `react-dom/server` 运行时验证。

### 10.2 手工冒烟

| 场景                                     | 检查点                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 浏览器 `Accept-Language: zh-CN` 打开门户 | 首页、Roadmap、Changelog、Status、Help Center、Notifications、Settings 全部中文；`<html lang="zh-CN">` |
| 打开私有门户登录墙                       | 首屏即中文，不闪英文；`Sign in · 工作区` 标题                                                          |
| `/csat?token=...`                        | 评分页正常渲染（不抛错），中文文案                                                                     |
| `/complete-signup/:id`                   | 邀请注册页正常渲染，中文文案                                                                           |
| `/verify-magic-link?token=...`           | 中文；`<html lang>` 正确                                                                               |
| `/portal-invite/:id`                     | 各状态中文                                                                                             |
| `/oauth/consent?...`                     | 中文授权页                                                                                             |
| `/auth/auth-complete`                    | popup 中文；错误码中文                                                                                 |
| `/widget?locale=de`                      | Widget 全德文；错误页也德文                                                                            |
| `Accept-Language: ar`                    | 门户 RTL；新增文案不破坏布局                                                                           |
| `Accept-Language: de`                    | 长文案不溢出按钮/卡片                                                                                  |
| `Accept-Language: th`                    | 泰文行高/断行正常                                                                                      |
| 评论框输入 `/`                           | 斜杠菜单、工具栏 tooltip 本地化                                                                        |
| 门户帖子卡片                             | "No status" 本地化；投票 aria 本地化                                                                   |
| 评论 reaction hover                      | "N reactions" 本地化，人名列表正确                                                                     |
| 门户筛选条                               | 删除筛选的 aria 本地化                                                                                 |
| 门户通知设置                             | Setup tips 本地化                                                                                      |
| 删除帖子对话框                           | 级联删除说明本地化                                                                                     |

### 10.3 回归风险

- 给 `rich-text-editor` 加 `intl` 时不要把它放进 `useEditor` 的依赖数组，否则切换语言会重建编辑器、丢草稿。
- `StandaloneIntlProvider` 只传 area 切片时，`useIntlSetup` 会认为"语言包已完整"而不再加载整包；要确保该页面用到的所有 key 都在切片里，否则会回退英文 `defaultMessage`。
- `PortalIntlProvider` 在 `DEFAULT_LOCALE` 下不需要 messages；不要给英文页面强行加载整包。
- 新增 `auth.blockMessage.*` 后，`auth.auth-complete` 和门户登录表单都要确认能取到；前者用 prefix helper，后者靠 `PORTAL_MESSAGE_PREFIXES`。
- 修改 `document-locale.ts` 后，阿拉伯语页面的 `dir` 会变化，需要检查新增页面的 RTL 布局。

---

## 11. 待确认的问题

1. **范围**：本轮是否只做 P0 + P1（页面接线 + 硬编码），还是把 P2（head/SEO）和 P3（SDK a11y）一起做？
2. **语言包**：新增约 200 条 key 后，是否本轮就补齐其余 11 个语言？如果不补，`locale-parity.test.ts` 会失败，需要临时放宽测试（不推荐）。
3. **门户语言切换器**：当前门户 UI 语言只跟随 `Accept-Language`，没有手动切换入口（Help Center 的切换器只影响文章内容语言）。是否需要加一个门户/顶栏语言选择器（cookie + `?lang=` + 重新加载/失效）？这会额外改 `_portal`、`portal-header`、`getPortalLocaleFn`、root `html lang`，建议单独一批。
4. **装饰性 mock**：私有门户登录墙背后的假帖子内容是否需要翻译？建议不翻译。
5. **Admin 后台**：本次不包含；后台目前 766 个组件里只有 66 个接入 i18n，`document-locale.ts` 也只本地化了 7 个设置页。确认后台放到下一阶段。

---

## 12. 建议的实施顺序

1. **批次 1**（半天）：修 `/csat`、`/complete-signup`、`/oauth/consent`、gate 首屏、`document-locale`。不新增 key，先把"会崩/永远英文"的问题解决。
2. **批次 2**（1 天）：修 4 个独立认证页 + 33 条认证错误码 + Widget 错误页。
3. **批次 3**（1-2 天）：富文本编辑器 + 门户共享组件。
4. **批次 4**（半天）：head/SEO。
5. **批次 5**（半天）：Widget SDK。
6. **批次 6**（1 天）：13 语言翻译 + 全量回归。

总计约 **4-5 个工作日**，新增约 **200 条 key**，涉及 **30 个左右的源码文件**。
