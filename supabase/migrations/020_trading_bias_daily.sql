-- Trading Bias Daily: persists daily briefing predictions + next-day outcome backfill
CREATE TABLE trading_bias_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  -- Prediction (logged at 9 AM)
  bias TEXT NOT NULL,                    -- "Strong Bull" | "Lean Bull" | "Neutral" | "Lean Bear" | "Strong Bear"
  confidence INTEGER,                    -- 0-100
  preferred_direction TEXT,              -- "Long" | "Short" | "Flat"
  direction TEXT,                        -- synthesized: "BULL" | "LEAN BULL" | "NEUTRAL" | "LEAN BEAR" | "BEAR"
  posture TEXT,                          -- "AGGRESSIVE" | "SELECTIVE" | "DEFENSIVE" | "CASH"
  regime TEXT,                           -- "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED"
  leading_asset TEXT,                    -- "ES" | "NQ" | "YM" | "RTY"
  weakest_asset TEXT,
  best_to_trade_symbol TEXT,
  best_to_trade_direction TEXT,          -- "long" | "short"
  asset_to_avoid TEXT,
  day_type TEXT,                         -- "Trend Day" | "Range Day" | "Uncertain"
  vix NUMERIC,
  bias_conflict BOOLEAN DEFAULT false,
  futures_snapshot JSONB,                -- raw: [{symbol, price, changePct}]
  -- Outcomes (backfilled next day)
  es_return_pct NUMERIC,
  nq_return_pct NUMERIC,
  ym_return_pct NUMERIC,
  rty_return_pct NUMERIC,
  bias_correct BOOLEAN,                 -- did preferred_direction match actual market?
  best_trade_return_pct NUMERIC,         -- return of bestToTrade in its predicted direction
  outcome_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (snapshot_date)
);
CREATE INDEX idx_tbd_snapshot_date ON trading_bias_daily (snapshot_date DESC);
