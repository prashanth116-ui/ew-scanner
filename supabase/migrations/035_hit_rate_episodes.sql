-- Make the sample size in `scanner_hit_rates` mean what a reader assumes it means.
--
-- The first daily_table pass counted every (ticker, scan_date) row as an independent
-- signal. A name that sits in one state for fifteen sessions produced fifteen rows, each
-- opening an overlapping 14-day window on the SAME move. That inflated total_signals by
-- roughly 8x (1,484 HIGHER_LOW_FORMATION rows over just 278 tickers) and — worse than the
-- bogus n — WEIGHTED THE MEAN toward names that persist in the scan, which are the names
-- already working. Collapsing to one observation per episode moved the 14d all-signal
-- excess from -0.78% to -1.61%, and turned HIGHER_LOW_FORMATION from the board's only
-- positive bucket (+0.88%) into a losing one (-1.63%). The first number was an artifact.
--
-- An "episode" is the session a ticker ENTERS a state: its first row, a state change, or a
-- return after a gap. That is the decision point a trader actually has.
--
-- Also records which scanner_version the sample came from. V2 and V3 disagree about what
-- TRIGGERED and is_stronger mean (V2's trigger was self-satisfying and its rows carry
-- runner_score 0), so blending them measures nothing in particular.

ALTER TABLE public.scanner_hit_rates
  -- Distinct tickers behind total_signals. If these diverge sharply the bucket is a few
  -- names repeated, whatever the n says.
  ADD COLUMN IF NOT EXISTS distinct_tickers integer,
  -- Engine version the sample was drawn from; null for target-based signal_outcomes rows.
  ADD COLUMN IF NOT EXISTS scanner_version  integer;

COMMENT ON COLUMN public.scanner_hit_rates.total_signals IS
  'For source=daily_table: EPISODES (state entries), not ticker-days. One observation per decision point.';
COMMENT ON COLUMN public.scanner_hit_rates.distinct_tickers IS
  'Distinct tickers contributing to total_signals. Large gaps between the two mean repeated names.';
COMMENT ON COLUMN public.scanner_hit_rates.scanner_version IS
  'Engine version the sample was drawn from. Never blend versions: V2/V3 redefine is_stronger.';
