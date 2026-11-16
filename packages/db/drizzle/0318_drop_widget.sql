-- @contract: safe-after 0.15.0   (The embeddable widget product is removed; existing data is preserved)
-- The embeddable widget product is removed. Messenger settings and per-locale
-- copy are kept by renaming the stored column; historical values the product
-- still reads (conversations.source = 'widget', user_segments.added_by =
-- 'widget', page_views.surface = 'widget') are left untouched.

-- Rename the stored widget config to messenger config, keeping its JSON data.
-- Guarded so a replay (or a database that already ran it) is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'settings'
      AND column_name = 'widget_config'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'settings'
      AND column_name = 'messenger_config'
  ) THEN
    ALTER TABLE settings RENAME COLUMN widget_config TO messenger_config;
  END IF;
END $$;
--> statement-breakpoint

-- The signing secret and install-detection columns belonged to the SDK
-- install flow only.
ALTER TABLE settings DROP COLUMN IF EXISTS widget_secret;
ALTER TABLE settings DROP COLUMN IF EXISTS widget_installed_first_seen_at;
ALTER TABLE settings DROP COLUMN IF EXISTS widget_installed_last_seen_at;
ALTER TABLE settings DROP COLUMN IF EXISTS widget_installed_origin_host;
ALTER TABLE settings DROP COLUMN IF EXISTS widget_installed_sdk_version;
--> statement-breakpoint

-- SDK-supplied post metadata is generic client metadata now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'posts'
      AND column_name = 'widget_metadata'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'posts'
      AND column_name = 'client_metadata'
  ) THEN
    ALTER TABLE posts RENAME COLUMN widget_metadata TO client_metadata;
  END IF;
END $$;
--> statement-breakpoint

-- Widget session provenance tables and their trigger function.
DROP TABLE IF EXISTS widget_identified_session CASCADE;
DROP TABLE IF EXISTS widget_origin_session CASCADE;
DROP FUNCTION IF EXISTS quackback_widget_session_scope();
--> statement-breakpoint

-- Sessions minted for the widget become ordinary portal sessions.
-- @replay: guarded-by the scope predicate; a second run updates nothing.
UPDATE "session" SET "scope" = 'portal' WHERE "scope" = 'widget';
--> statement-breakpoint

-- New conversations arrive on the portal. Historical rows keep their source.
ALTER TABLE conversations ALTER COLUMN source SET DEFAULT 'portal';
