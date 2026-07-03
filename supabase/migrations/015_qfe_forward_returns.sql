-- Forward return tracking for QFE validation
-- Populated by a lightweight daily backfill cron
ALTER TABLE qfe_daily ADD COLUMN IF NOT EXISTS fwd_1d_pct REAL;
ALTER TABLE qfe_daily ADD COLUMN IF NOT EXISTS fwd_5d_pct REAL;
ALTER TABLE qfe_daily ADD COLUMN IF NOT EXISTS fwd_10d_pct REAL;
ALTER TABLE qfe_daily ADD COLUMN IF NOT EXISTS fwd_return_updated_at TIMESTAMPTZ;

-- Index for efficient backfill queries (find rows needing update)
CREATE INDEX IF NOT EXISTS idx_qfe_daily_fwd_backfill
  ON qfe_daily (scan_date)
  WHERE fwd_1d_pct IS NULL OR fwd_5d_pct IS NULL OR fwd_10d_pct IS NULL;
