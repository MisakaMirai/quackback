# 生产机数据库更新（保留生产数据）

> 生产数据禁止丢弃。本文档描述如何在**不重建数据库、不清空业务表**的前提下，应用本分支的 Quackback AI 移除迁移，并用分支代码重启服务。
>
> `0316_drop_quackback_ai.sql` 只删除 AI 专用的表、列和权限，不会删除反馈、收件箱、帮助中心、Changelog、状态页等业务数据。
>
> 状态：AI 移除已经合入主线，本文保留为一次性操作手册。后续的 `0319_drop_retired_tables.sql` 按同样原则删除工作流引擎表、Labs 实验表和 `settings.state` 列，同样不触碰业务数据；已执行过 0316 的实例升级时只需应用剩余迁移。

## 1. 变更范围

迁移会删除：

- AI 表：`assistant_pending_actions`、`assistant_tool_calls`、`assistant_events`、`assistant_guidance_rules`、`assistant_web_sources`、`assistant_snippets`、`assistant_documents`、`assistant_involvements`、`agent_skills`、`connectors`、`ai_usage_log`、`conversation_summaries`、`ticket_summaries`、`post_sentiment`、`post_merge_suggestions`、`workspace_assistant_threads`、`conversation_message_translations`、`slack_thread_sessions`
- AI 列：`posts.embedding*`/`summary*`/`merge_checked_at`、`changelog_entries.embedding*`、`kb_articles.embedding*`、`settings.assistant_config*`、会话翻译列、`conversation_messages.citations`/`workspace_thread_key`、`post_tags.ai_prompt`、会话属性的 `ai_detect`/`detect_on_close`
- AI 权限：`ai.customer.manage`、`ai.teammate.manage`、`copilot.use`

不会删除：

- `posts`、`post_comments`、`post_votes`
- `conversations`、`conversation_messages`、`tickets`
- `principal`、`user`、`roles`、`role_permissions`
- `settings`（只删除其中的 AI 配置列）
- `changelog_entries`、`kb_articles` 及其手工翻译
- 反馈、收件箱、帮助中心、Changelog、状态页的业务行

> AI 表/列一旦删除无法通过 down migration 恢复；只能从**迁移前备份**恢复。业务表不受影响。

## 2. 迁移前检查

1. 进入维护窗口，停止旧版本应用，避免迁移期间继续写入。
2. 确认当前迁移状态和业务数据基线：

   ```bash
   bun run db:check-drift
   ```

   记录以下表的行数，迁移后逐项对比：

   ```sql
   SELECT 'posts', count(*) FROM posts
   UNION ALL SELECT 'conversations', count(*) FROM conversations
   UNION ALL SELECT 'conversation_messages', count(*) FROM conversation_messages
   UNION ALL SELECT 'tickets', count(*) FROM tickets
   UNION ALL SELECT 'principal', count(*) FROM principal
   UNION ALL SELECT 'settings', count(*) FROM settings
   UNION ALL SELECT 'changelog_entries', count(*) FROM changelog_entries
   UNION ALL SELECT 'kb_articles', count(*) FROM kb_articles;
   ```

3. 备份数据库（必须成功，且检查文件非空）：

   ```bash
   pg_dump "$DATABASE_URL" -Fc -f quackback-before-ai-removal-$(date +%Y%m%d-%H%M%S).dump
   ls -lh quackback-before-ai-removal-*.dump
   ```

   如果使用对象存储，另行备份上传文件（S3/MinIO bucket），本次迁移不改对象数据，但回滚需要配套的数据库与对象存储快照。

4. 建议在临时库验证备份可恢复：

   ```bash
   createdb quackback_restore_check
   pg_restore --no-owner --no-acl -d quackback_restore_check quackback-before-ai-removal-*.dump
   ```

## 3. 执行迁移

在停止旧代码后执行：

```bash
bun run db:migrate
```

容器部署时，入口默认会自动执行迁移。如果希望先手工迁移、再启动应用：

```bash
SKIP_MIGRATIONS=true
```

先执行迁移，再启动新容器。

迁移完成后校验：

```bash
bun run db:check-drift
```

预期：

```text
No drift: migrations and TS schema are in sync.
```

并确认 `0316_drop_quackback_ai` 已记录在迁移账本中：

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;
```

该数量应比迁移前多 1。

## 4. 启动新版本

迁移成功后，启动与本分支代码版本一致的应用。不要让旧版本代码继续运行：旧代码仍会查询已被删除的 AI 表/列。

使用 Docker Compose 的典型流程：

```bash
# 1. 备份数据库与对象存储
# 2. 停止旧应用
docker compose -f docker-compose.prod.yml stop app

# 3. 迁移（可让新容器启动时自动执行；或先手工执行）
docker compose -f docker-compose.prod.yml run --rm app bun /app/migrate.mjs

# 4. 启动新版本
docker compose -f docker-compose.prod.yml up -d app
```

如果使用 `SKIP_MIGRATIONS=true`，请确保迁移命令在启动新代码之前单独执行。

从源码运行：

```bash
bun run build
NODE_ENV=production bun apps/web/.output/server/index.mjs
```

（开发环境仍可用 `bun run dev`；生产请使用进程管理器、systemd 或容器，避免会话结束导致服务退出。）

## 5. 迁移后验收

1. 对比第 2 步记录的业务表行数，必须完全一致。
2. 检查 AI 对象已消失：

   ```sql
   SELECT to_regclass('public.assistant_events'),
          to_regclass('public.connectors'),
          to_regclass('public.conversation_summaries');
   ```

   三列都应为 `NULL`。

3. 检查 AI 列已消失：

   ```sql
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'settings'
     AND column_name LIKE 'assistant_config%';
   ```

   应返回 0 行。

4. 健康检查：

   ```bash
   curl -fsS "$BASE_URL/api/health/ready"
   ```

   应返回 `status: ok`，且 `db`、`migrations`、`workers` 均为 ok。

5. 人工抽查：

   - 反馈列表、帖子详情、投票与评论
   - 收件箱会话、消息、分配、标签
   - 工单列表与详情
   - 帮助中心文章、分类、手工翻译
   - Changelog 列表与详情
   - 状态页
   - 登录、设置保存、API key

6. 确认 AI 入口已消失：AI 设置页、Ask AI、Quinn 活动视图、AI 标签/自动分类、Copilot、Slack agent。

## 6. 回滚

本迁移没有 down migration。回滚步骤：

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$DATABASE_URL" quackback-before-ai-removal-*.dump
```

然后恢复旧版本应用。

注意：

- 只有**迁移前**的备份能恢复 AI 表/列。
- 迁移后新产生的业务数据会因 `--clean` 回滚丢失；如果必须保留迁移后的新数据，应做逻辑导出/比对，而不是直接整库恢复。
- 若只回滚代码、不回滚数据库，旧代码会因 AI 表/列不存在而报错，因此数据库和代码必须成对回滚。

## 7. 关于“全新项目模式”

本分支不再保留 AI 的历史代码、表、列和权限，但**不要求重置生产数据库**。生产机按本文档执行 `0312` 即可：

- 业务数据保留
- AI 数据按需求删除
- 旧代码与新 schema 不并行运行
- 不需要 expand/contract 双版本过渡

`DROP DATABASE`、`bun run db:reset`、清空 volume 只适用于本地开发或确认可丢弃数据的环境，**禁止用于生产**。

## 8. 发布检查清单

- [ ] 已停止旧应用/进入维护窗口
- [ ] 已备份数据库，备份文件非空
- [ ] 已记录业务表行数基线
- [ ] `bun run db:migrate` 成功
- [ ] `bun run db:check-drift` 输出 `No drift`
- [ ] 业务表行数与迁移前一致
- [ ] AI 表/列查询返回 `NULL`/0 行
- [ ] 新版本应用已启动，健康检查 `ok`
- [ ] 反馈、收件箱、工单、帮助中心、Changelog、状态页抽查通过
- [ ] AI 入口已消失
- [ ] 已保留迁移前备份，并记录恢复命令
