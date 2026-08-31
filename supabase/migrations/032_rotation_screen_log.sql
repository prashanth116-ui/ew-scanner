-- Forward log for the rotation entry screen.
--
-- The screen's thresholds were fitted on 78 historical rotations, of which only 8
-- fired. That is a small sample chosen after trying roughly fifteen configurations,
-- in a window where just 8 of 78 rotations had a negative 20-day ETF return. The only
-- thing that turns it from a calibration into evidence is recording what it picks
-- BEFORE the outcome is known, and scoring it later.
--
-- Deliberately NOT purged on the 14-day scan retention. Scan rows are derived and
-- reproducible from price history; these are observations with a timestamp, and their
-- whole value is that they cannot be regenerated after the fact.

CREATE TABLE IF NOT EXISTS rotation_screen_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  etf                TEXT NOT NULL,
  sector             TEXT NOT NULL,
  -- Identity is the rotation, not the day we looked. Re-running the cron while a
  -- rotation is still active must not create a second row or revise the first.
  rotation_start     DATE NOT NULL,

  -- When we first recorded it. A row where this is far after rotation_start is a
  -- backfill of an already-running rotation, not a forward observation, and must be
  -- excluded when measuring the screen's real-time hit rate. See is_forward below.
  logged_at          DATE NOT NULL,
  is_forward         BOOLEAN NOT NULL,

  verdict            TEXT NOT NULL,          -- TRADE | SKIP_THIN | SKIP_GATE | NO_DATA
  qualifying         INTEGER NOT NULL,
  symbols            TEXT[] NOT NULL DEFAULT '{}',

  -- Gate as read on the rotation start bar — the values that produced the verdict.
  gate_breadth       NUMERIC,
  gate_cmf           NUMERIC,
  gate_accel         NUMERIC,
  gate_pass          BOOLEAN NOT NULL,

  etf_price_at_start NUMERIC,

  -- Filled once the 20 trading-day window has elapsed.
  scored_at          DATE,
  etf_fwd_pct        NUMERIC,
  basket_fwd_pct     NUMERIC,
  names_positive     INTEGER,
  names_scored       INTEGER,
  -- Per-symbol forward returns, so a disappointing basket can be attributed rather
  -- than just noted: {"TEAM": 66.5, "HUBS": -0.2}
  outcomes           JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rotation_screen_log_rotation
  ON rotation_screen_log (etf, rotation_start);

-- The scoring pass reads exactly this: rows old enough to score, not yet scored.
CREATE INDEX IF NOT EXISTS idx_rotation_screen_log_unscored
  ON rotation_screen_log (rotation_start)
  WHERE scored_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rotation_screen_log_verdict
  ON rotation_screen_log (verdict, rotation_start DESC);

COMMENT ON TABLE rotation_screen_log IS
  'Pre-registered picks from the rotation entry screen, scored after 20 trading days. Never purged.';
COMMENT ON COLUMN rotation_screen_log.is_forward IS
  'True when logged within a few sessions of the rotation start. False rows are backfills and must be excluded from real-time hit-rate claims.';
