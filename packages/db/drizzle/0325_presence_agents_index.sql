-- The presence query `WHERE is_agent AND heartbeat_at > …` was served by a
-- partial index that led with the tenant column, so 0324 dropped that column
-- and the index with it. Restore the index in its single-instance form: the
-- same predicate and trailing column, without the tenant prefix.

CREATE INDEX IF NOT EXISTS "presence_stream_agents_idx"
  ON "presence_stream" ("heartbeat_at") WHERE "is_agent";
