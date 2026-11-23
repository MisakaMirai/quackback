-- @contract: safe-after 0.15.0   (Native mobile push is removed; device tokens are dropped)
-- APNs/FCM registration tokens for the mobile agent app. Nothing in this build
-- reads them: the app and its external push consumer are not part of
-- self-hosting, so a self-hoster never writes here.

DROP TABLE IF EXISTS "push_devices" CASCADE;
