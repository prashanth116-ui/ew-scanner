-- Per-slot component breakdown for the Inflection and Transition engines.
--
-- A component score alone cannot be attributed. "demand_score = 20" does not say whether
-- volume was flat, whether there were no pocket pivots, or whether OBV simply could not be
-- measured — and those lead to different decisions. V2 exposed accum_score and
-- volume_score separately; V3 merged them into demand_score and, in doing so, lost the
-- diagnostic granularity even though it computes strictly more slots than V2 did.
--
-- This restores the granularity without touching the scoring. The slots already exist in
-- code; they were simply summed before being persisted. Nothing here changes a score.
--
-- Shape: { "<component>": [ { label, earned, possible, hasData, pct }, ... ], ... }
--
-- e.g. {"demand":[{"label":"pocket_pivots","earned":0,"possible":24,"hasData":true,"pct":0},
--                 {"label":"rvol_trajectory","earned":12,"possible":16,"hasData":true,"pct":75}]}
--
-- `hasData` is kept rather than collapsing a missing slot to zero. "Measured, and the
-- answer is no" and "could not measure" must stay distinguishable — that distinction is
-- what nullNeutralScore is built on, and flattening it here would reintroduce downstream
-- the exact bug the scorer avoids.
--
-- JSONB rather than columns: the slot set differs per component and changes with the
-- engine. Columns would mean a migration every time a slot is added, and 40+ mostly-null
-- columns on every row.

ALTER TABLE inflection_daily ADD COLUMN IF NOT EXISTS component_slots JSONB;
ALTER TABLE transition_daily ADD COLUMN IF NOT EXISTS component_slots JSONB;

COMMENT ON COLUMN inflection_daily.component_slots IS
  'Per-slot breakdown keyed by component. Labels are schema; renaming one breaks saved queries.';
COMMENT ON COLUMN transition_daily.component_slots IS
  'Per-slot breakdown keyed by component. Labels are schema; renaming one breaks saved queries.';

-- Slot-level querying, e.g. "rows where demand had pocket pivots but no rvol build".
-- GIN over jsonb_path_ops is the smaller, faster index for containment queries, which is
-- what slot lookups are. It does not serve arbitrary key existence, which is not needed.
CREATE INDEX IF NOT EXISTS idx_inflection_component_slots
  ON inflection_daily USING GIN (component_slots jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_transition_component_slots
  ON transition_daily USING GIN (component_slots jsonb_path_ops);
