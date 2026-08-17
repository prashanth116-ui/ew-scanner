-- Scanner audit fixes: Transition extension risk + structure availability.
--
-- extension_risk     mirrors the Inflection scanner's guard (near ATH or stretched
--                    from EMA20). Blocks TRIGGERED and is_primary so late entries
--                    stop reaching the Top Picks banner and the confluence tiers.
-- structure_available false when the OHLC series was too short to run ChoCH/BOS
--                    detection, so "no structure found" is distinguishable from
--                    "structure could not be evaluated".
--
-- Both default false, which matches the pre-migration behaviour for existing rows
-- except that historical rows will read structure_available = false; they are
-- purged on the 14-day retention cycle.

ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS extension_risk BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS structure_available BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_transition_daily_primary
  ON transition_daily (scan_date DESC, is_primary)
  WHERE is_primary = true;
