-- @contract: safe-after 0.15.0   (Workflow engine, Labs experiments and one inert settings column are removed; business data is preserved)
-- The workflow engine and the Labs experiments were removed from the product.
-- Drop only their own tables and two retired settings keys; feedback, support,
-- help center, changelog, status and identity data are untouched.

-- The engine's tables. Runs/events/versions reference the workflows row, so
-- drop the dependants first.
DROP TABLE IF EXISTS "workflow_run_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workflow_runs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workflow_versions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workflows" CASCADE;
--> statement-breakpoint
-- Labs experiments (Quackback AI's Home surface) are gone.
DROP TABLE IF EXISTS "workspace_experiments" CASCADE;
--> statement-breakpoint
-- Inert control-plane suspension flag; the OSS app never read it.
ALTER TABLE settings DROP COLUMN IF EXISTS "state";
--> statement-breakpoint
-- AI-era keys inside the operator limits JSON. The token budget and the
-- classifier switch no longer have a reader.
UPDATE settings
SET tier_limits = (tier_limits::jsonb - 'aiTokensPerMonth')::text
WHERE tier_limits IS NOT NULL AND tier_limits LIKE '%aiTokensPerMonth%';
--> statement-breakpoint
UPDATE settings
SET spam_filter_config = (spam_filter_config::jsonb - 'aiClassifier')::text
WHERE spam_filter_config IS NOT NULL AND spam_filter_config LIKE '%aiClassifier%';
