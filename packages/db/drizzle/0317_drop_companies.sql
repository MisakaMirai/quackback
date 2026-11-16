-- @contract: safe-after 0.15.0   (Companies is removed; business tables and data are preserved)
-- The B2B companies feature is removed. Drop only company-owned tables, columns,
-- indexes and permission keys; business data (posts, conversations, tickets,
-- people, help center, changelog, settings) is not reset or truncated.

-- The ticket -> company context link is gone with the feature.
DROP INDEX IF EXISTS tickets_company_id_idx;
ALTER TABLE tickets DROP COLUMN IF EXISTS company_id;

-- The principal -> company link is gone with the feature.
ALTER TABLE principal DROP COLUMN IF EXISTS company_id;

-- The company directory and its attribute definitions are gone.
DROP TABLE IF EXISTS company_attribute_definitions CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- Company permissions are gone from the catalogue; remove their rows.
DELETE FROM permissions WHERE key IN ('company.view', 'company.manage');
