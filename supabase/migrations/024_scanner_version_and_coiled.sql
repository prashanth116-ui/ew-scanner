-- Scanner version marker + the coiled pre-break tier.
--
-- scanner_version
--   V3 recomposed both engines, so a V3 score and a V2 score are different measurements.
--   The daily pages compute a "delta" against the previous scan date, which silently
--   compared the two across the changeover. Existing rows default to 2; the crons write 3.
--   Any comparison (delta, streak-weighted ranking, backtest cohort) must filter to a
--   single version.
--
-- is_coiled
--   Pre-break high-conviction setup: supply exhausted, demand emerging, compression tight
--   and Runner Potential real, with NO structural break yet. is_primary requires
--   BULLISH_CHOCH or higher, which by definition means the break already happened — so
--   every genuinely early setup landed in WATCH and never reached the confluence.
--   This is the tier for catching a move before it starts.

ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS scanner_version INTEGER NOT NULL DEFAULT 2;
ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS is_coiled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE inflection_daily
  ADD COLUMN IF NOT EXISTS scanner_version INTEGER NOT NULL DEFAULT 2;

-- Rows written before this migration came from the V3 crons already deployed, so mark
-- today's forward: anything carrying a runner_score is V3 by construction (the column
-- did not exist under V2).
UPDATE transition_daily SET scanner_version = 3 WHERE runner_score > 0 AND scanner_version = 2;
UPDATE inflection_daily SET scanner_version = 3 WHERE runner_score > 0 AND scanner_version = 2;

CREATE INDEX IF NOT EXISTS idx_transition_daily_coiled
  ON transition_daily (scan_date DESC, is_coiled)
  WHERE is_coiled = true;
