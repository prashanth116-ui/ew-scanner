-- QFE Decision Engine daily scan results
CREATE TABLE IF NOT EXISTS qfe_daily (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_date             DATE NOT NULL,
  ticker                TEXT NOT NULL,
  company_name          TEXT,
  sector                TEXT DEFAULT '',
  price                 NUMERIC(10,2),
  market_cap            NUMERIC,
  -- Engine scores
  qfe_score             INTEGER NOT NULL,
  quality_score         INTEGER NOT NULL,
  leadership_score      INTEGER NOT NULL,
  entry_score           INTEGER NOT NULL,
  market_env_score      INTEGER NOT NULL,
  -- Classifications
  rating                TEXT NOT NULL,
  action                TEXT NOT NULL,
  risk_level            TEXT NOT NULL,
  extension_level       TEXT NOT NULL,
  -- Multi-TF RS (12 fields)
  rs_5d_spy             NUMERIC(8,4),
  rs_10d_spy            NUMERIC(8,4),
  rs_20d_spy            NUMERIC(8,4),
  rs_50d_spy            NUMERIC(8,4),
  rs_5d_qqq             NUMERIC(8,4),
  rs_10d_qqq            NUMERIC(8,4),
  rs_20d_qqq            NUMERIC(8,4),
  rs_50d_qqq            NUMERIC(8,4),
  rs_5d_sector          NUMERIC(8,4),
  rs_10d_sector         NUMERIC(8,4),
  rs_20d_sector         NUMERIC(8,4),
  rs_50d_sector         NUMERIC(8,4),
  -- Key signals
  money_flow_persistence INTEGER,
  rvol_trajectory       NUMERIC(8,4),
  float_rotation        NUMERIC(8,4),
  weekly_reversal       BOOLEAN DEFAULT false,
  dist_from_ema10_atr   NUMERIC(6,3),
  dist_from_ema20_atr   NUMERIC(6,3),
  -- Commentary
  commentary            TEXT,
  -- Preset source
  source_presets         TEXT[],
  -- Metadata
  data_quality          INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_qfe_daily_date ON qfe_daily (scan_date);
CREATE INDEX IF NOT EXISTS idx_qfe_daily_score ON qfe_daily (scan_date, qfe_score DESC);
CREATE INDEX IF NOT EXISTS idx_qfe_daily_rating ON qfe_daily (scan_date, rating);
