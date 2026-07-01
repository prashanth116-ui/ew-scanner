-- Institutional Acceleration Daily Scan results
-- Stores nightly institutional acceleration scan results for SP500 + NDX100 universe.
-- 14-day rolling retention, purged by cron.

CREATE TABLE IF NOT EXISTS institutional_daily (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date             DATE NOT NULL,
  ticker                TEXT NOT NULL,
  company_name          TEXT,
  sector                TEXT DEFAULT '',
  price                 NUMERIC(10,2) NOT NULL,
  composite_score       INTEGER NOT NULL,
  institutional_score   INTEGER NOT NULL DEFAULT 0,
  execution_score       INTEGER NOT NULL DEFAULT 0,
  risk_score            INTEGER NOT NULL DEFAULT 0,
  discipline_score      INTEGER NOT NULL DEFAULT 0,
  classification        TEXT NOT NULL DEFAULT 'NEUTRAL_HOLD',
  entry_quality         TEXT,
  best_trigger          TEXT,
  tier                  TEXT,
  avoid_reason          TEXT,
  commentary_summary    TEXT,
  rs_accel_spy          NUMERIC(8,4),
  rs_accel_qqq          NUMERIC(8,4),
  gap_pct               NUMERIC(6,3),
  dist_from_ema20_atr   NUMERIC(6,3),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX idx_institutional_daily_scan_date ON institutional_daily (scan_date DESC);
CREATE INDEX idx_institutional_daily_classification ON institutional_daily (classification);
CREATE INDEX idx_institutional_daily_tier ON institutional_daily (tier);
