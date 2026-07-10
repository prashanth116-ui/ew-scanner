-- Transition daily scan results (market structure transition detection)
CREATE TABLE IF NOT EXISTS transition_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  sector TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  overall_score INTEGER NOT NULL,
  se_score INTEGER NOT NULL DEFAULT 0,
  accum_score INTEGER NOT NULL DEFAULT 0,
  choch_score INTEGER NOT NULL DEFAULT 0,
  bos_score INTEGER NOT NULL DEFAULT 0,
  compression_score INTEGER NOT NULL DEFAULT 0,
  hl_score INTEGER NOT NULL DEFAULT 0,
  rs_score INTEGER NOT NULL DEFAULT 0,
  volume_score INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  alert_state TEXT NOT NULL,
  trigger_level NUMERIC(10,2),
  invalidation NUMERIC(10,2),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_stronger BOOLEAN NOT NULL DEFAULT false,
  bullish_evidence TEXT[],
  caution_evidence TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_transition_daily_scan_date ON transition_daily (scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_transition_daily_state ON transition_daily (state);
CREATE INDEX IF NOT EXISTS idx_transition_daily_alert_state ON transition_daily (alert_state);
