-- @contract: safe-after 0.15.0   (Custom domain ownership verification is removed; business data is preserved)
-- Domains added by name on Settings > Domains, and the shared ownership record
-- that proved them, are gone. Email-sending domains and single sign-on domains
-- are untouched: each still verifies with its own DNS record. Only the shared
-- proof and its warning state are dropped.

DROP TABLE IF EXISTS "domains" CASCADE;
