-- @contract: safe-after 0.15.0   (The Zendesk sidebar app platform is removed; app registrations and subscriptions are dropped)
-- Apps were OAuth clients plus a signed webhook endpoint, registered only by the
-- Zendesk sidebar app. Both the app and its sidebar are gone, so nothing in this
-- build reads or writes these rows. Historical post_external_links rows written
-- by the sidebar stay: they are votes and links users made, not app state.

DROP TABLE IF EXISTS "apps" CASCADE;
