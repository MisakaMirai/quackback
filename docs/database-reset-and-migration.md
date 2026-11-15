# 生产机数据库更新（全新项目模式）

> 本分支按“全新项目”处理：不保留 Quackback AI 的历史数据、表、列或兼容代码。  
> 因此生产机不需要做双版本兼容，也不需要回填旧 AI 数据。

## 方案 A：生产数据可丢弃（推荐，符合“全新项目”）

适用于新上线、测试环境、或确认不需要旧数据的环境。

1. **停应用**，避免迁移期间继续写入。
2. **备份**（即使计划丢弃，也建议留一份）：
   ```bash
   pg_dump "$DATABASE_URL" -Fc -f quackback-before-reset.dump
   ```
3. **重建空库**（示例，数据库名按实际替换）：
   ```sql
   DROP DATABASE quackback WITH (FORCE);
   CREATE DATABASE quackback;
   ```
4. **跑完整迁移**：
   ```bash
   bun run db:migrate
   ```
5. **可选初始化数据**：
   ```bash
   bun run db:seed
   ```
6. **校验**：
   ```bash
   bun run db:check-drift
   ```
   预期输出：`No drift: migrations and TS schema are in sync.`
7. 启动新版本应用。

容器部署时，入口脚本默认会自动执行迁移；如果需要手工控制，设置：

```bash
SKIP_MIGRATIONS=true
```

然后先单独执行 `bun run db:migrate`，再启动应用。需要容器首次启动时写入种子数据，可设置：

```bash
SEED_DATABASE=true
```

`bun run db:reset` 只适用于本地 Docker 开发环境（会删容器和卷），不要用于生产。

## 方案 B：生产数据要保留

本分支的 `packages/db/drizzle/0312_drop_quackback_ai.sql` 是**破坏性迁移**：它会删除 AI 表、AI 列以及相关历史字段。既然按全新项目处理，执行顺序应是“停旧代码 → 迁移 → 启新代码”，不要让旧版本代码继续读已被删除的列。

1. **停应用 / 进入维护窗口**。
2. **完整备份**：
   ```bash
   pg_dump "$DATABASE_URL" -Fc -f quackback-before-ai-removal.dump
   ```
3. **执行迁移**：
   ```bash
   bun run db:migrate
   ```
   容器入口默认也会执行；如果由发布流程统一执行，设置 `SKIP_MIGRATIONS=true`。
4. **校验**：
   ```bash
   bun run db:check-drift
   ```
5. **启动与迁移版本匹配的新代码**。
6. 如需回滚，只能恢复备份（本迁移没有 down migration）：
   ```bash
   pg_restore --clean --if-exists -d "$DATABASE_URL" quackback-before-ai-removal.dump
   ```

## 迁移会删除什么

`0312_drop_quackback_ai.sql` 删除 AI 相关表，包括：

`assistant_pending_actions`、`assistant_tool_calls`、`assistant_events`、
`assistant_guidance_rules`、`assistant_web_sources`、`assistant_snippets`、
`assistant_documents`、`assistant_involvements`、`agent_skills`、`connectors`、
`ai_usage_log`、`conversation_summaries`、`ticket_summaries`、`post_sentiment`、
`post_merge_suggestions`、`workspace_assistant_threads`、
`conversation_message_translations`、`slack_thread_sessions`。

删除的列包括：

- `posts.embedding*`、`posts.summary*`、`posts.merge_checked_at`
- `changelog_entries.embedding*`、`kb_articles.embedding*`
- `settings.assistant_config`、`settings.assistant_config_revision`
- `conversations.detected_customer_language`、`translation_enabled`、`translation_dismissed_at`
- `conversation_messages.citations`、`workspace_thread_key`
- `post_tags.ai_prompt`
- `conversation_attribute_definitions.ai_detect`、`detect_on_close`

## 迁移约定

该文件带：

```sql
-- @contract: safe-after 0.14.0
```

表示它已经是评审过的破坏性变更。因为本项目按全新项目处理，生产机可以直接执行；不再要求先发布一版只停止读取旧列、再删除列的 expand/contract 过渡版本。

## 发布检查清单

- [ ] 已备份生产库
- [ ] 已停止旧版本应用（或已设置维护页）
- [ ] `bun run db:migrate` 成功
- [ ] `bun run db:check-drift` 输出 `No drift`
- [ ] 启动的新代码与迁移版本一致
- [ ] 抽查反馈、收件箱、帮助中心、Changelog、状态页可正常读写
- [ ] 确认 AI 设置页、Ask AI、Quinn 活动视图、AI 标签/属性检测等入口不再出现
