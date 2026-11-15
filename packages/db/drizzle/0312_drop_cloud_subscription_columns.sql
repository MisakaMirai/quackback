-- Remove the Quackback Cloud subscription columns from `settings`.
--
-- Nothing in the app reads the plan, entitlement or cloud-identity
-- projections any more: the billing UI, the entitlement gates, the
-- control-plane client and the projections were removed, and the only
-- remaining copies in a workspace are the stale values a Cloud deployment
-- once wrote. 0.15.0 is the first release that never reads these columns,
-- so they are safe to drop once no workspace still runs an older build.
-- @contract: safe-after 0.16.0   (0.15.0 is the first release that never reads them)
ALTER TABLE "settings" DROP COLUMN IF EXISTS "cloud";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "cloud_revision";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "cloud_identity";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "cloud_identity_revision";
