-- Pre-Runner Radar daily scan results
CREATE TABLE IF NOT EXISTS prerunner_daily (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date             DATE NOT NULL,
  ticker                TEXT NOT NULL,
  company_name          TEXT,
  type                  TEXT NOT NULL,
  prerunner_score       SMALLINT NOT NULL,
  price                 NUMERIC(10,2) NOT NULL,
  rs_acceleration       NUMERIC(8,2) NOT NULL,
  rs_improving          BOOLEAN NOT NULL DEFAULT false,
  rs_delta              NUMERIC(8,2) NOT NULL DEFAULT 0,
  sector                TEXT NOT NULL,
  sector_etf            TEXT NOT NULL,
  sector_quadrant       TEXT,
  sector_composite      SMALLINT,
  lifecycle             TEXT,
  rotation_days_active  SMALLINT,
  volume_ratio          NUMERIC(6,2),
  regime_alignment      TEXT,
  conviction            TEXT,
  performance_pct       NUMERIC(8,2),
  above_sma50           BOOLEAN NOT NULL DEFAULT false,
  volume_consistency    SMALLINT,
  trend_accel           NUMERIC(8,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX idx_prerunner_daily_scan_date ON prerunner_daily (scan_date DESC);
CREATE INDEX idx_prerunner_daily_score ON prerunner_daily (prerunner_score DESC);
