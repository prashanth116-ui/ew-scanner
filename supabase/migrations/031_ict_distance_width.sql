-- Widen ict_daily.distance_to_bsl_pct.
--
-- The column was NUMERIC(5,2), which caps at +/-999.99. Once the engine started
-- refreshing distance on every bar (rather than freezing it when a setup left
-- ARMED) the value goes negative as soon as price clears the draw, and a stale
-- setup holding a target far behind spot produces figures well past -1000%.
--
-- Postgres rejects the row, and because the upsert writes in batches the whole
-- batch went with it: the first production run under the new engine qualified
-- 422 rows and persisted 369. The 53 that vanished did so silently, since the
-- upsert logs the error and returns a count rather than throwing.
--
-- Migration 032 (stale-setup expiry, in the engine) removes the cause. This
-- removes the cliff, so a single out-of-range value can never again take its
-- neighbours down with it. upsertICTDaily also now falls back to per-row writes
-- when a batch fails, so a bad row costs one row.

ALTER TABLE ict_daily
  ALTER COLUMN distance_to_bsl_pct TYPE NUMERIC(10,2);
