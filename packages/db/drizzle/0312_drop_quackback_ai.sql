-- Quackback AI is removed. Drop its tables; application code no longer reads
-- or writes them.
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
