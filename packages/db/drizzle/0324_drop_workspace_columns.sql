-- @contract: safe-after 0.15.0   (The pooled runtime is gone; one install is one workspace)
-- The cache, rate-limit, presence, realtime-overflow and job-queue tables carried a
-- `workspace_key` discriminator from the multi-tenant runtime. This build serves one
-- workspace per install, so nothing reads the column and the key alone identifies a
-- row. Dropping it also removes the composite primary keys that led with it; each
-- table's remaining columns are unique by construction on a single-workspace install.
-- Duplicates, which could only come from a database several workspaces once shared,
-- are collapsed first so the narrower primary key can be created. Every statement is
-- guarded on the column still existing, so a replay is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kv_store' AND column_name = 'workspace_key'
  ) THEN
    DELETE FROM kv_store a USING kv_store b
    WHERE a.ctid < b.ctid AND a.key = b.key;
    ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey;
    ALTER TABLE kv_store DROP COLUMN workspace_key;
    ALTER TABLE kv_store ADD CONSTRAINT kv_store_pkey PRIMARY KEY (key);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rate_bucket' AND column_name = 'workspace_key'
  ) THEN
    DELETE FROM rate_bucket a USING rate_bucket b
    WHERE a.ctid < b.ctid AND a.key = b.key;
    ALTER TABLE rate_bucket DROP CONSTRAINT IF EXISTS rate_bucket_pkey;
    ALTER TABLE rate_bucket DROP COLUMN workspace_key;
    ALTER TABLE rate_bucket ADD CONSTRAINT rate_bucket_pkey PRIMARY KEY (key);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kv_set_member' AND column_name = 'workspace_key'
  ) THEN
    DELETE FROM kv_set_member a USING kv_set_member b
    WHERE a.ctid < b.ctid AND a.set_key = b.set_key AND a.member = b.member;
    ALTER TABLE kv_set_member DROP CONSTRAINT IF EXISTS kv_set_member_pkey;
    ALTER TABLE kv_set_member DROP COLUMN workspace_key;
    ALTER TABLE kv_set_member ADD CONSTRAINT kv_set_member_pkey PRIMARY KEY (set_key, member);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'presence_stream' AND column_name = 'workspace_key'
  ) THEN
    DELETE FROM presence_stream a USING presence_stream b
    WHERE a.ctid < b.ctid AND a.principal_id = b.principal_id AND a.stream_id = b.stream_id;
    ALTER TABLE presence_stream DROP CONSTRAINT IF EXISTS presence_stream_pkey;
    ALTER TABLE presence_stream DROP COLUMN workspace_key;
    ALTER TABLE presence_stream ADD CONSTRAINT presence_stream_pkey PRIMARY KEY (principal_id, stream_id);
  END IF;
END $$;

ALTER TABLE realtime_overflow DROP COLUMN IF EXISTS workspace_key;
ALTER TABLE job_queue DROP COLUMN IF EXISTS workspace_key;
