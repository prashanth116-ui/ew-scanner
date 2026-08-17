-- ICT Price Action Pre-Expansion Engine daily scan results
CREATE TABLE IF NOT EXISTS ict_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  sector TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL,

  -- Best timeframe summary
  best_state TEXT NOT NULL,
  best_state_order INTEGER NOT NULL,
  best_timeframe TEXT NOT NULL,
  best_score INTEGER NOT NULL,
  confluence_score INTEGER NOT NULL DEFAULT 0,
  armed_timeframes TEXT[],

  -- Key levels (from best TF)
  bsl_target NUMERIC(10,2),
  protected_low NUMERIC(10,2),
  fvg_upper NUMERIC(10,2),
  fvg_lower NUMERIC(10,2),
  distance_to_bsl_pct NUMERIC(5,2),

  -- Flags
  is_chasing BOOLEAN NOT NULL DEFAULT false,
  is_late_entry BOOLEAN NOT NULL DEFAULT false,

  -- Per-timeframe states
  state_4h TEXT,
  state_8h TEXT,
  state_12h TEXT,
  state_1d TEXT,
  state_1wk TEXT,

  -- Per-timeframe scores
  score_4h INTEGER,
  score_8h INTEGER,
  score_12h INTEGER,
  score_1d INTEGER,
  score_1wk INTEGER,

  -- Score components (best TF)
  state_score INTEGER DEFAULT 0,
  displacement_quality INTEGER DEFAULT 0,
  fvg_quality INTEGER DEFAULT 0,
  retracement_depth INTEGER DEFAULT 0,
  bsl_quality INTEGER DEFAULT 0,
  compression_quality INTEGER DEFAULT 0,
  structure_coherence INTEGER DEFAULT 0,
  invalidation_distance INTEGER DEFAULT 0,

  -- Evidence
  bullish_evidence TEXT[],
  caution_evidence TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ict_daily_scan_date ON ict_daily (scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_ict_daily_best_state ON ict_daily (best_state);
CREATE INDEX IF NOT EXISTS idx_ict_daily_best_score ON ict_daily (best_score DESC);
