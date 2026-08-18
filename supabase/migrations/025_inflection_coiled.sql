-- Inflection coiled tier — mirrors transition_daily.is_coiled.
--
-- determineTradeRead returns WATCH unconditionally for SELLER_EXHAUSTION, which after the
-- V3 recalibration is ~46% of the table. Names with strong Runner Potential and a tight
-- coil got the lowest read available and never reached the nightly confluence. is_coiled
-- surfaces the ones that are genuinely ready without promoting the rest.

ALTER TABLE inflection_daily
  ADD COLUMN IF NOT EXISTS is_coiled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inflection_daily_coiled
  ON inflection_daily (scan_date DESC, is_coiled)
  WHERE is_coiled = true;
