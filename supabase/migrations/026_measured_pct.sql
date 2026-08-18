-- How much of each composite was actually measurable.
--
-- weightedComposite renormalizes over the components that had data, which is correct but
-- silent: a score built from two of six components is indistinguishable from one built from
-- all six. Transient upstream fetch failures do happen — the same ticker scored 18 points
-- apart between two crons minutes apart, at an identical price, because a chart fetch failed
-- in one run and the null-neutral aggregator quietly renormalized.
--
-- Persisting this makes thin scores visible and lets the backtest exclude or segment them
-- rather than treating a 30%-measured row as equal evidence to a fully-measured one.
--
-- Defaults to 100 so existing rows are not retroactively marked as thin — they predate the
-- measurement and their true coverage is unknown, not low.

ALTER TABLE inflection_daily
  ADD COLUMN IF NOT EXISTS measured_pct INTEGER NOT NULL DEFAULT 100;

ALTER TABLE transition_daily
  ADD COLUMN IF NOT EXISTS measured_pct INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_inflection_daily_measured
  ON inflection_daily (scan_date DESC, measured_pct);
CREATE INDEX IF NOT EXISTS idx_transition_daily_measured
  ON transition_daily (scan_date DESC, measured_pct);
