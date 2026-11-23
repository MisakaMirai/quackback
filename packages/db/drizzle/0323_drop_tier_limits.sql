-- @contract: safe-after 0.15.0   (Operator tier limits are removed with the hosted runtime; the column has no reader)
-- `settings.tier_limits` was the JSON row the config file reconciled into and
-- every enforcement seam read. Single-workspace self-hosting has no operator
-- caps: boards, posts, seats, status components/subscribers, help center
-- languages, API rates and email volume are unlimited, and every feature gate
-- is on. Nothing in this build reads the column.

ALTER TABLE settings DROP COLUMN IF EXISTS "tier_limits";
