-- Pre-Run Scanner Tables
-- Migration for the Pre-Run multi-bagger scanner module

-- Watchlist: user-managed list of tracked stocks
CREATE TABLE IF NOT EXISTS prerun_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  company_name text,
  verdict text CHECK (verdict IN ('KEEP','WATCH','DISCARD','PRIORITY')),
  risk_level text CHECK (risk_level IN ('LOW','MEDIUM','HIGH','VERY_HIGH')),
  stop_loss numeric,
  thesis text,
  catalyst_description text,
  gate2_pass boolean DEFAULT true,
  score_c integer CHECK (score_c BETWEEN 0 AND 2) DEFAULT 1,
  score_g integer CHECK (score_g BETWEEN 0 AND 2) DEFAULT 1,
  notes text,
  added_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stock data cache — refreshed nightly
CREATE TABLE IF NOT EXISTS prerun_stock_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  company_name text,
  current_price numeric,
  high_52w numeric,
  low_52w numeric,
  pct_from_ath numeric,
  market_cap numeric,
  short_float numeric,
  next_earnings_date date,
  days_to_earnings integer,
  revenue_growth_yoy numeric,
  analyst_count integer,
  sma20 numeric,
  avg_volume_up_days numeric,
  avg_volume_down_days numeric,
  last_updated timestamptz DEFAULT now()
);

-- Calculated scores
CREATE TABLE IF NOT EXISTS prerun_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid REFERENCES prerun_watchlist(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  gate1 boolean,
  gate2 boolean,
  gate3 boolean,
  gates_pass boolean,
  score_a integer,
  score_b integer,
  score_c integer,
  score_d integer,
  score_e integer,
  score_f integer,
  score_g integer,
  total_score integer,
  final_score integer,
  verdict text,
  calculated_at timestamptz DEFAULT now()
);

-- Nightly scan output
CREATE TABLE IF NOT EXISTS prerun_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date date DEFAULT current_date,
  ticker text NOT NULL,
  company_name text,
  current_price numeric,
  pct_from_ath numeric,
  short_float numeric,
  days_to_earnings integer,
  auto_score integer,
  verdict text,
  gate1_pass boolean,
  gate3_pass boolean,
  reason_flagged text,
  sector_bucket text,
  actioned boolean DEFAULT false,
  added_to_watchlist boolean DEFAULT false
);

-- Alerts (stop-loss, earnings, webhooks, etc.)
CREATE TABLE IF NOT EXISTS prerun_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  alert_type text,
  message text,
  price numeric,
  stop_loss numeric,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Change history log
CREATE TABLE IF NOT EXISTS prerun_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text,
  change_type text,
  from_value text,
  to_value text,
  notes text,
  changed_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prerun_watchlist_ticker ON prerun_watchlist(ticker);
CREATE INDEX IF NOT EXISTS idx_prerun_stock_data_ticker ON prerun_stock_data(ticker);
CREATE INDEX IF NOT EXISTS idx_prerun_scores_ticker ON prerun_scores(ticker);
CREATE INDEX IF NOT EXISTS idx_prerun_scan_results_date ON prerun_scan_results(scan_date);
CREATE INDEX IF NOT EXISTS idx_prerun_alerts_unread ON prerun_alerts(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_prerun_history_ticker ON prerun_history(ticker);

-- ── Seed data: 9 initial watchlist stocks ──

INSERT INTO prerun_watchlist (ticker, company_name, verdict, risk_level, stop_loss, gate2_pass, score_c, score_g, thesis, catalyst_description) VALUES
  ('HTZ', 'Hertz Global Holdings', 'KEEP', 'HIGH', 5.50, true, 2, 1,
   'CAR replay — 18%+ short float, TSA chaos driving rental demand, EBITDA turning positive',
   'TSA staffing crisis pushing travelers to rent cars. Same setup as CAR before its 264% run.'),
  ('SMCI', 'Super Micro Computer', 'KEEP', 'VERY_HIGH', 20.00, false, 2, 1,
   '+123% revenue, fwd P/E 9x, legal cloud creates entry discount',
   'AI server demand structural. Co-founder indictment (not company) keeps stock cheap.'),
  ('ON', 'ON Semiconductor', 'KEEP', 'MEDIUM', 64.00, true, 2, 0,
   '$6B buyback, PEG 0.51, AI+EV inflection, approaching 52w high breakout',
   'vGaN chips reduce AI datacenter power loss 50%. $44B TAM at 18% CAGR.'),
  ('VG', 'Venture Global LNG', 'KEEP', 'MEDIUM', 10.00, true, 2, 2,
   'Iran conflict = structural LNG demand shift. 14x earnings, profitable',
   'Iran conflict structurally altered global LNG supply. US LNG becomes premium asset.'),
  ('OKLO', 'Oklo Inc', 'WATCH', 'VERY_HIGH', 44.00, true, 2, 1,
   'First NRC approval (isotopes). Meta 1.2GW deal. July 4 reactor criticality hard catalyst',
   'First NRC materials license received March 2026 = narrative shift from never to when.'),
  ('MP', 'MP Materials', 'WATCH', 'MEDIUM', 22.00, true, 2, 1,
   'China REE export ban = structural tailwind. Only US rare earth miner at scale',
   'China banned rare earth exports 2025. MP is only US producer. DoD backed.'),
  ('PLUG', 'Plug Power', 'WATCH', 'HIGH', 2.50, true, 2, 0,
   'New CEO, first positive gross margin, EBITDA breakeven 2026 target',
   'Q4 2025 gross margin +2.4% — 125pp improvement. New CEO profitability roadmap.'),
  ('IREN', 'IREN Limited', 'WATCH', 'HIGH', 28.00, true, 2, 1,
   'Run done, re-basing. Wait for two clean earnings beats before re-entry',
   '$9.7B Microsoft contract + 150K NVIDIA B300 GPUs on order. Execution lagging narrative.'),
  ('CRDO', 'Credo Technology', 'WATCH', 'HIGH', 0, true, 2, 0,
   'Run done ($33→$158). Wait for pullback to $120-130 for re-entry setup',
   'DustPhotonics acquisition + Jefferies Buy initiation. 70% AEC market share.');
