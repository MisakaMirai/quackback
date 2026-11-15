-- @contract: safe-after 0.14.0   (Quackback AI is removed; business tables and data are preserved)
-- Quackback AI is removed. Drop only AI-owned tables, columns and permissions;
-- business data (posts, conversations, tickets, help center, changelog, settings)
-- is not reset or truncated.
DROP TABLE IF EXISTS assistant_pending_actions CASCADE;
DROP TABLE IF EXISTS assistant_tool_calls CASCADE;
DROP TABLE IF EXISTS assistant_events CASCADE;
DROP TABLE IF EXISTS assistant_guidance_rules CASCADE;
DROP TABLE IF EXISTS assistant_web_sources CASCADE;
DROP TABLE IF EXISTS assistant_snippets CASCADE;
DROP TABLE IF EXISTS assistant_documents CASCADE;
DROP TABLE IF EXISTS assistant_involvements CASCADE;
DROP TABLE IF EXISTS agent_skills CASCADE;
DROP TABLE IF EXISTS connectors CASCADE;
DROP TABLE IF EXISTS ai_usage_log CASCADE;
DROP TABLE IF EXISTS conversation_summaries CASCADE;
DROP TABLE IF EXISTS ticket_summaries CASCADE;
DROP TABLE IF EXISTS post_sentiment CASCADE;
DROP TABLE IF EXISTS post_merge_suggestions CASCADE;

-- Retired Home chat transcripts: messages no longer carry a workspace thread.
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_workspace_thread_key_fkey;
DROP INDEX IF EXISTS conversation_messages_workspace_created_idx;
DROP INDEX IF EXISTS conversation_messages_workspace_run_sender_idx;
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_workspace_internal_check;
ALTER TABLE conversation_messages DROP COLUMN IF EXISTS workspace_thread_key;
DROP TABLE IF EXISTS workspace_assistant_threads CASCADE;

-- The parent check no longer has a third parent.
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_parent_check;
ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_parent_check
  CHECK (num_nonnulls(conversation_id, ticket_id) = 1);

-- Inbox translation is removed: no detected language, toggle, or dismissal.
ALTER TABLE conversations DROP COLUMN IF EXISTS detected_customer_language;
ALTER TABLE conversations DROP COLUMN IF EXISTS translation_enabled;
ALTER TABLE conversations DROP COLUMN IF EXISTS translation_dismissed_at;
DROP TABLE IF EXISTS conversation_message_translations CASCADE;

-- The workspace-thread cascade could take these with it; restore the
-- conversation-message constraints/indexes the rest of the product relies on.
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_principal_id_fkey;
ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_principal_id_fkey
  FOREIGN KEY (principal_id) REFERENCES principal(id) ON DELETE RESTRICT;
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_deleted_by_principal_id_fkey;
ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_deleted_by_principal_id_fkey
  FOREIGN KEY (deleted_by_principal_id) REFERENCES principal(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created_idx
  ON conversation_messages (conversation_id, created_at, id);

-- AI-generated post summaries and semantic-search embeddings.
DROP INDEX IF EXISTS posts_embedding_hnsw_idx;
ALTER TABLE posts
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_updated_at,
  DROP COLUMN IF EXISTS summary_json,
  DROP COLUMN IF EXISTS summary_model,
  DROP COLUMN IF EXISTS summary_updated_at,
  DROP COLUMN IF EXISTS summary_comment_count,
  DROP COLUMN IF EXISTS merge_checked_at;

DROP INDEX IF EXISTS changelog_embedding_hnsw_idx;
ALTER TABLE changelog_entries
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_updated_at;

DROP INDEX IF EXISTS kb_articles_embedding_hnsw_idx;
ALTER TABLE kb_articles
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_updated_at;

-- Retired assistant configuration (identity, agents, Copilot capabilities).
ALTER TABLE settings
  DROP COLUMN IF EXISTS assistant_config,
  DROP COLUMN IF EXISTS assistant_config_revision;

-- KB citation markers on assistant-authored messages.
ALTER TABLE conversation_messages DROP COLUMN IF EXISTS citations;

-- AI auto-tagging prompt rules.
ALTER TABLE post_tags DROP COLUMN IF EXISTS ai_prompt;

-- Deterministic AI classification of conversation attributes is removed.
ALTER TABLE conversation_attribute_definitions DROP COLUMN IF EXISTS ai_detect;
ALTER TABLE conversation_attribute_definitions DROP COLUMN IF EXISTS detect_on_close;

-- Slack agent thread sessions.
DROP TABLE IF EXISTS slack_thread_sessions CASCADE;

-- AI access-control keys are gone with the features they guarded.
DELETE FROM permissions WHERE key IN ('ai.customer.manage', 'ai.teammate.manage', 'copilot.use');
