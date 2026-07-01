-- VCP Daily Scan results
-- Stores nightly VCP breakout scan results for SP500 + NDX100 universe.
-- 14-day rolling retention, purged by cron.

CREATE TABLE IF NOT EXISTS vcp_daily (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date             DATE NOT NULL,
  ticker                TEXT NOT NULL,
  company_name          TEXT,
  sector                TEXT DEFAULT '',
  price                 NUMERIC(10,2) NOT NULL,
  total_score           INTEGER NOT NULL,
  trend_score           INTEGER NOT NULL DEFAULT 0,
  volume_score          INTEGER NOT NULL DEFAULT 0,
  compression_score     INTEGER NOT NULL DEFAULT 0,
  rel_strength_score    INTEGER NOT NULL DEFAULT 0,
  risk_quality_score    INTEGER NOT NULL DEFAULT 0,
  phase                 TEXT NOT NULL DEFAULT 'IGNORE',
  pivot_high            NUMERIC(10,2),
  atr_pct               NUMERIC(6,3),
  dist_from_sma50_pct   NUMERIC(6,2),
  dry_volume_days       SMALLINT,
  tight_closes          BOOLEAN,
  inside_bar_count      SMALLINT,
  entry                 NUMERIC(10,2),
  stop                  NUMERIC(10,2),
  target_2r             NUMERIC(10,2),
  target_3r             NUMERIC(10,2),
  sma10_exit            NUMERIC(10,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX idx_vcp_daily_scan_date ON vcp_daily (scan_date DESC);
CREATE INDEX idx_vcp_daily_phase ON vcp_daily (phase);
