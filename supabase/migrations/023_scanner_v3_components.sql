-- Scanner V3: recomposed components for the Inflection and Transition engines.
--
-- Inflection  6 components -> 5:  Supply Exhaustion, Demand Emergence, Compression,
--                                 Runner Potential, RS Trajectory
-- Transition  8 components -> 6:  Structure, Supply Exhaustion, Demand Emergence,
--                                 Compression, Runner Potential, RS Trajectory
--
-- Runner Potential is the new dimension: overhead supply, ATR%, base energy, float
-- rotation and insider buying. Both engines previously scored setup readiness only, so a
-- coiled mega-cap that can move 6% outranked a name that can move 40%.
--
-- Column reuse keeps the migration small:
--   inflection_daily.se_score          -> Supply Exhaustion   (was Seller Exhaustion)
--   inflection_daily.vc_score          -> Compression         (was Volatility Compression)
--   inflection_daily.rs_score          -> RS Trajectory       (unchanged)
--   transition_daily.se_score          -> Supply Exhaustion
--   transition_daily.compression_score -> Compression
--   transition_daily.rs_score          -> RS Trajectory
--
-- Legacy columns (be_score, la_score, ip_score, accum_score, choch_score, bos_score,
-- hl_score, volume_score) are left in place and simply stop being written. They are
-- NOT NULL DEFAULT 0, so inserts that omit them succeed and historical rows keep their
-- values until the 14-day retention window purges them.

ALTER TABLE inflection_daily
  ADD COLUMN IF NOT EXISTS demand_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inflection_daily
  ADD COLUMN IF NOT EXISTS runner_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS structure_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS demand_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS runner_score INTEGER NOT NULL DEFAULT 0;

-- Runner Potential is the dimension a "quality runners" screen sorts on, so both tables
-- get an index for it alongside the scan date.
CREATE INDEX IF NOT EXISTS idx_inflection_daily_runner
  ON inflection_daily (scan_date DESC, runner_score DESC);
CREATE INDEX IF NOT EXISTS idx_transition_daily_runner
  ON transition_daily (scan_date DESC, runner_score DESC);
