-- Scanner signals & outcome tracking
-- Enables historical validation, hit rate computation, and forward predictions

-- Table 1: signal_outcomes (all scanners — tracks predictions vs reality)
CREATE TABLE public.signal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner text NOT NULL CHECK (scanner IN ('ew', 'squeeze', 'confluence', 'prerun')),
  ticker text NOT NULL,
  signal_date date NOT NULL,
  price_at_signal numeric NOT NULL,
  mode text,
  signal_strength text,
  score numeric,
  target1 numeric,
  target2 numeric,
  target3 numeric,
  invalidation numeric,
  -- Outcomes (filled by nightly cron):
  price_7d numeric,
  price_30d numeric,
  price_60d numeric,
  price_90d numeric,
  hit_target1 boolean,
  hit_target2 boolean,
  hit_target3 boolean,
  hit_invalidation boolean,
  hit_target1_date date,
  max_drawdown_pct numeric,
  max_gain_pct numeric,
  outcome_updated_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(scanner, ticker, signal_date, mode)
);

CREATE INDEX idx_signal_outcomes_ticker ON public.signal_outcomes(ticker, signal_date);
CREATE INDEX idx_signal_outcomes_scanner ON public.signal_outcomes(scanner, mode);
CREATE INDEX idx_signal_outcomes_pending ON public.signal_outcomes(scanner)
  WHERE price_7d IS NULL;

-- Table 2: si_history (squeeze SI% trend tracking)
CREATE TABLE public.si_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  report_date date NOT NULL,
  si_percent numeric,
  days_to_cover numeric,
  shares_short bigint,
  float_shares bigint,
  current_price numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ticker, report_date)
);

CREATE INDEX idx_si_history_ticker ON public.si_history(ticker, report_date DESC);

-- Table 3: sector_snapshots (weekly RRG positions)
CREATE TABLE public.sector_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  sector text NOT NULL,
  etf_symbol text NOT NULL,
  rs_ratio numeric,
  rs_momentum numeric,
  quadrant text CHECK (quadrant IN ('LEADING', 'WEAKENING', 'LAGGING', 'IMPROVING')),
  momentum_score numeric,
  breadth_pct numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, sector)
);

CREATE INDEX idx_sector_snapshots_sector ON public.sector_snapshots(sector, snapshot_date DESC);

-- Table 4: ftd_settlements (T+35 forward calendar)
CREATE TABLE public.ftd_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  failure_date date NOT NULL,
  settlement_deadline date NOT NULL,
  ftd_shares bigint NOT NULL,
  ftd_pct_float numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ticker, failure_date)
);

CREATE INDEX idx_ftd_settlements_deadline ON public.ftd_settlements(settlement_deadline);
CREATE INDEX idx_ftd_settlements_ticker ON public.ftd_settlements(ticker, settlement_deadline DESC);

-- Table 5: scanner_hit_rates (pre-computed aggregate stats)
CREATE TABLE public.scanner_hit_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner text NOT NULL,
  mode text,
  signal_strength text,
  period_days integer NOT NULL,
  total_signals integer DEFAULT 0,
  hit_count integer DEFAULT 0,
  hit_rate numeric,
  avg_return_pct numeric,
  avg_max_drawdown_pct numeric,
  computed_at timestamptz DEFAULT now(),
  UNIQUE(scanner, mode, signal_strength, period_days)
);

-- RLS: These tables are server-managed (cron jobs write, API reads).
-- No RLS needed — accessed via service role key in server routes.
-- If user-specific access is added later, add RLS policies then.
