-- Distinguish machine-generated catalyst tags from hand-entered ones.
--
-- Without this the earnings syncer and the user write to the same undifferentiated rows,
-- and the first re-run silently overwrites a note someone typed. Worse, there is no way
-- to tell afterwards which rows were trusted judgement and which were a feed.
--
-- 'manual'          — typed by hand at /catalysts. The syncer must never touch these.
-- 'auto:earnings'   — from the Finnhub earnings calendar. Owned entirely by the syncer,
--                     which may freely update or delete them as dates move.
--
-- The distinction also drives alert behaviour: a hand-entered catalyst promotes a focus
-- name past the FOCUS tier gate, an auto earnings tag only badges it. You already know
-- earnings are coming; a Phase 3 readout is the one you would forget.

ALTER TABLE catalyst_tags
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN catalyst_tags.source IS
  'manual = hand-entered, never touched by a syncer. auto:* = feed-owned, safe to replace.';

-- The syncer's hot query: "every auto:earnings row, so I can reconcile against the feed".
CREATE INDEX IF NOT EXISTS idx_catalyst_tags_source ON catalyst_tags (source);

-- A hand-entered tag must be able to coexist with an auto one for the same event — you
-- may want your own note on an earnings date the feed also knows about. The original
-- unique index on (ticker, event_date, event_type) would have collapsed them into one
-- row, letting the syncer clobber the note. Widen it to include source.
DROP INDEX IF EXISTS idx_catalyst_tags_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalyst_tags_unique
  ON catalyst_tags (ticker, event_date, event_type, source);
