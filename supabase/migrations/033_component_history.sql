-- Long-horizon archive of the Inflection and Transition component scores.
--
-- The nine scan tables purge at 14 days (purgeOldInflectionDaily and siblings), which is
-- correct for them: those rows are derived and reproducible from price history, and the
-- pages that read them only ever ask about the last few scans. But it means the component
-- trend can never show more than a fortnight, and the trend of a component is exactly the
-- thing a single scan cannot tell you — NOW's Seller Exhaustion going 26 -> 49 over six
-- scans was the read, not any one of those numbers.
--
-- So this table is NOT purged. It holds only the component scores and the labels, which is
-- narrow enough that keeping it forever is cheap: ~700 rows/day across both engines, about
-- 250k rows a year.
--
-- It is deliberately NOT a superset of the scan tables. Evidence arrays, trigger levels,
-- invalidation, component_slots and everything else stay on the 14-day tables. If it grew
-- to mirror them it would become a second copy of the scanner output with its own drift,
-- and the whole point is that this is a small, stable, append-only series.

CREATE TABLE IF NOT EXISTS component_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  scan_date     DATE NOT NULL,
  -- 'inflection' | 'transition'. One table rather than two because every consumer wants
  -- them side by side, and the column set is identical apart from structure_score.
  engine        TEXT NOT NULL,
  ticker        TEXT NOT NULL,

  sector        TEXT,
  price         NUMERIC(12,2),

  se_score          INTEGER NOT NULL,
  demand_score      INTEGER NOT NULL,
  compression_score INTEGER NOT NULL,
  runner_score      INTEGER NOT NULL,
  rs_score          INTEGER NOT NULL,
  overall_score     INTEGER NOT NULL,
  -- Transition only. Inflection has no Structure component, so NULL there means
  -- "does not apply", not "not measured".
  structure_score   INTEGER,

  -- stage (inflection) or state (transition); trade_read or alert_state.
  label         TEXT NOT NULL DEFAULT '',
  read_label    TEXT NOT NULL DEFAULT '',

  is_coiled     BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  is_stronger   BOOLEAN NOT NULL DEFAULT FALSE,
  extension_risk BOOLEAN NOT NULL DEFAULT FALSE,

  -- V2 and V3 scores are different measurements, so a consumer comparing across a
  -- recalibration needs to know which engine version produced the row.
  scanner_version INTEGER,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Re-running a cron for the same day must revise the row, not append a second one.
  UNIQUE (scan_date, engine, ticker)
);

-- The trend matrix reads a window of dates and then groups by ticker, so lead with
-- scan_date. The second index serves the per-ticker history view.
CREATE INDEX IF NOT EXISTS idx_component_history_date
  ON component_history (scan_date DESC, engine);

CREATE INDEX IF NOT EXISTS idx_component_history_ticker
  ON component_history (ticker, engine, scan_date DESC);
