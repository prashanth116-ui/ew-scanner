-- Hit rates that can be read without being misled.
--
-- `scanner_hit_rates` has carried avg_return_pct since migration 003, and an absolute
-- average return is close to meaningless on its own: in the three weeks to 2026-09-22 the
-- Transition scanner's is_stronger signals averaged -4.5% while QQQ returned +5.1%. A row
-- reading "-4.5%" and a row reading "+5.1%" can describe the same edge, or opposite ones,
-- depending entirely on what the tape did over the holding window. Only the spread is
-- comparable across periods, so store it.
--
-- Also adds the sample window. The table sat stale from 2026-05-18 to 2026-09-22 because
-- the cron that fills it was never scheduled, and nothing in a row said so — computed_at
-- is when the row was WRITTEN, not the period it describes. sample_start/end make a stale
-- or thin row self-evident at a glance.

ALTER TABLE public.scanner_hit_rates
  -- Median alongside mean: forward returns are right-skewed and a single +177% MRNA-style
  -- print drags the mean somewhere no position actually lived.
  ADD COLUMN IF NOT EXISTS median_return_pct      numeric,
  -- Benchmark (SPY) return over the SAME holding windows, averaged across the signals in
  -- this bucket — not a fixed-period constant.
  ADD COLUMN IF NOT EXISTS benchmark_return_pct   numeric,
  -- avg(signal return - benchmark return), per signal. The headline number.
  ADD COLUMN IF NOT EXISTS avg_excess_return_pct  numeric,
  -- Share of signals that beat the benchmark. Distinct from hit_rate, which is the share
  -- that merely went up — in a rising tape those diverge sharply, and the second one is
  -- the one that flatters.
  ADD COLUMN IF NOT EXISTS win_rate_vs_benchmark  numeric,
  -- Signal-date span actually covered, so staleness and thin samples are visible.
  ADD COLUMN IF NOT EXISTS sample_start_date      date,
  ADD COLUMN IF NOT EXISTS sample_end_date        date,
  -- 'signal_outcomes' (ew/squeeze/confluence/prerun, target-based) or 'daily_table'
  -- (inflection/transition, forward-return based). The two are computed differently and
  -- must not be averaged together.
  ADD COLUMN IF NOT EXISTS source                 text;

COMMENT ON COLUMN public.scanner_hit_rates.avg_excess_return_pct IS
  'avg(signal return - SPY return) over the same holding window. Compare buckets on this, not avg_return_pct.';
COMMENT ON COLUMN public.scanner_hit_rates.period_days IS
  'Holding horizon in CALENDAR days. Exit is the last close on or before signal_date + period_days.';
COMMENT ON COLUMN public.scanner_hit_rates.source IS
  'signal_outcomes = target-hit based; daily_table = forward-return based. Different definitions of hit_rate.';

-- The hot read is "latest rates for this scanner", which fetchHitRates() does on every
-- /api/signals call.
CREATE INDEX IF NOT EXISTS idx_hit_rates_scanner_computed
  ON public.scanner_hit_rates (scanner, computed_at DESC);
