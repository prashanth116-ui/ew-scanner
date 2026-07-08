-- PreRun 4h Daily Scan results (4-hour candle scoring engine)
-- Same schema as prerun_daily but uses 4h-aggregated chart data with
-- barMultiplier=6 for rescaled technical indicator lookback windows.
-- Catches momentum shifts earlier than daily candles.
-- 14-day rolling retention, purged by cron.

CREATE TABLE IF NOT EXISTS prerun_4h_daily (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date                DATE NOT NULL,
  ticker                   TEXT NOT NULL,
  company_name             TEXT,
  sector                   TEXT DEFAULT '',
  price                    NUMERIC(10,2) NOT NULL,
  market_cap               NUMERIC(16,0),
  pct_from_ath             NUMERIC(6,2),
  short_float              NUMERIC(6,2),
  final_score              INTEGER NOT NULL,
  total_score              INTEGER NOT NULL,
  score_a                  SMALLINT NOT NULL DEFAULT 0,
  score_b                  SMALLINT NOT NULL DEFAULT 0,
  score_c                  SMALLINT NOT NULL DEFAULT 0,
  score_d                  SMALLINT NOT NULL DEFAULT 0,
  score_e                  SMALLINT NOT NULL DEFAULT 0,
  score_f                  SMALLINT NOT NULL DEFAULT 0,
  score_g                  SMALLINT NOT NULL DEFAULT 0,
  score_h                  SMALLINT NOT NULL DEFAULT 0,
  score_i                  SMALLINT NOT NULL DEFAULT 0,
  score_j                  SMALLINT NOT NULL DEFAULT 0,
  score_k                  SMALLINT NOT NULL DEFAULT 0,
  score_l                  SMALLINT NOT NULL DEFAULT 0,
  score_m                  SMALLINT NOT NULL DEFAULT 0,
  score_m2                 SMALLINT NOT NULL DEFAULT 0,
  score_n                  SMALLINT NOT NULL DEFAULT 0,
  score_o                  SMALLINT NOT NULL DEFAULT 0,
  score_p                  SMALLINT NOT NULL DEFAULT 0,
  score_q                  SMALLINT NOT NULL DEFAULT 0,
  sector_modifier          SMALLINT NOT NULL DEFAULT 0,
  sector_quadrant_modifier SMALLINT NOT NULL DEFAULT 0,
  gate1                    BOOLEAN NOT NULL DEFAULT false,
  gate2                    BOOLEAN NOT NULL DEFAULT false,
  gate3                    BOOLEAN NOT NULL DEFAULT false,
  verdict                  TEXT NOT NULL DEFAULT 'DISCARD',
  obv_divergent            BOOLEAN NOT NULL DEFAULT false,
  vp_divergence_bullish    BOOLEAN NOT NULL DEFAULT false,
  higher_lows_count        SMALLINT,
  rrg_quadrant             TEXT,
  -- Preset qualification flags
  is_sndk                  BOOLEAN NOT NULL DEFAULT false,
  is_early_mover           BOOLEAN NOT NULL DEFAULT false,
  is_pullback              BOOLEAN NOT NULL DEFAULT false,
  is_leading               BOOLEAN NOT NULL DEFAULT false,
  is_stealth               BOOLEAN NOT NULL DEFAULT false,
  is_early_plus            BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX idx_prerun_4h_daily_scan_date ON prerun_4h_daily (scan_date DESC);
CREATE INDEX idx_prerun_4h_daily_is_sndk ON prerun_4h_daily (is_sndk) WHERE is_sndk = true;
CREATE INDEX idx_prerun_4h_daily_is_early_mover ON prerun_4h_daily (is_early_mover) WHERE is_early_mover = true;
CREATE INDEX idx_prerun_4h_daily_is_pullback ON prerun_4h_daily (is_pullback) WHERE is_pullback = true;
CREATE INDEX idx_prerun_4h_daily_is_leading ON prerun_4h_daily (is_leading) WHERE is_leading = true;
CREATE INDEX idx_prerun_4h_daily_is_stealth ON prerun_4h_daily (is_stealth) WHERE is_stealth = true;
CREATE INDEX idx_prerun_4h_daily_is_early_plus ON prerun_4h_daily (is_early_plus) WHERE is_early_plus = true;
