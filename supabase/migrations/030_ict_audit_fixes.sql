-- ICT engine audit fixes.
--
-- Adds the columns the rebuilt engine produces. Nothing here changes an existing
-- value; every column is additive and nullable (or defaulted), so rows written by
-- the previous engine keep loading.
--
-- The load-bearing ones:
--
--   htf_bias                  Higher-timeframe (1d/1wk) structural bias. The framework
--                             is HTF bias -> PD array -> entry, and the engine
--                             previously had no notion of it: every timeframe was an
--                             equal standalone vote, so a 4h setup running against a
--                             dead weekly ranked identically to one running with it.
--
--   risk_reward               (bsl_target - price) / (price - protected_low). Both
--                             inputs were already persisted; the number a trader
--                             actually decides on was not.
--
--   range_retracement,        Premium/discount and OTE location within the dealing
--   in_discount, in_ote       range. Depth into the FVG is a different, much smaller
--                             construct — a setup can sit mid-gap while the leg as a
--                             whole is in premium, which is the entry the framework
--                             exists to avoid.
--
--   state_bars_ago            A state persists until it advances or invalidates, so
--                             "Armed" alone never said whether the compression was
--                             live or six weeks stale.
--
--   prior_invalidation_*      The engine used to return a dead high-water setup as if
--                             it were current, asserting a stop and a target price had
--                             already taken out. It now reports the live state and
--                             carries the earlier break here as caution context.
--
--   entry_quality,            Two new score components. See src/lib/ict/config.ts
--   recency_score             SCORING for the full 100-point budget.
--
--   state_1h / score_1h       1h is now scanned natively.
--
-- state_8h/12h and score_8h/12h are left in place for already-persisted rows but are
-- no longer written: a US equity RTH session is 6.5 hours, so neither candle can be
-- formed without merging bars across days.

ALTER TABLE ict_daily
  ADD COLUMN IF NOT EXISTS risk_reward NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS htf_bias TEXT NOT NULL DEFAULT 'NEUTRAL',
  ADD COLUMN IF NOT EXISTS range_retracement NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS in_discount BOOLEAN,
  ADD COLUMN IF NOT EXISTS in_ote BOOLEAN,
  ADD COLUMN IF NOT EXISTS state_bars_ago INTEGER,
  ADD COLUMN IF NOT EXISTS is_tradeable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prior_invalidation_state TEXT,
  ADD COLUMN IF NOT EXISTS prior_invalidation_bars_ago INTEGER,
  ADD COLUMN IF NOT EXISTS prior_invalidation_reason TEXT,
  ADD COLUMN IF NOT EXISTS entry_quality INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recency_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_1h TEXT,
  ADD COLUMN IF NOT EXISTS score_1h INTEGER;

-- distance_to_bsl_pct is now refreshed on every bar rather than freezing when the
-- setup advanced past ARMED, and goes negative once the draw is cleared. The
-- existing NUMERIC(5,2) already accommodates that sign.

COMMENT ON COLUMN ict_daily.state_8h IS 'DEPRECATED — no longer written. A 6.5h RTH session cannot form an 8h candle.';
COMMENT ON COLUMN ict_daily.state_12h IS 'DEPRECATED — no longer written. A 6.5h RTH session cannot form a 12h candle.';
COMMENT ON COLUMN ict_daily.score_8h IS 'DEPRECATED — no longer written.';
COMMENT ON COLUMN ict_daily.score_12h IS 'DEPRECATED — no longer written.';

CREATE INDEX IF NOT EXISTS idx_ict_daily_tradeable ON ict_daily (scan_date DESC, is_tradeable);
