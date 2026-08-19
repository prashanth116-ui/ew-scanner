-- Hand-entered catalysts: a dated event you know about that no price scanner can see.
--
-- MRNA is the motivating case. It sat flat at $63 for a week while five scanners tracked
-- it, then gapped +117% on 9.5x volume — a clinical readout. Nothing derived from OHLCV
-- predicts that, and nothing should pretend to. What the system CAN do is remind you the
-- date is coming, so a position is sized deliberately rather than by surprise.
--
-- Deliberately NOT purged on the 14-day scan retention. Scan rows are derived and
-- reproducible; these are typed by hand and cannot be regenerated. A catalyst is also
-- often entered weeks ahead of the event, which is longer than the scan window.

CREATE TABLE IF NOT EXISTS catalyst_tags (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker       TEXT NOT NULL,
  event_date   DATE NOT NULL,
  -- Free text rather than an enum: the interesting catalysts are the ones nobody
  -- anticipated needing a category for.
  event_type   TEXT NOT NULL,
  note         TEXT,
  -- Set once the event has happened, so a stale row stops nagging without being deleted.
  -- Kept rather than removed because the outcome is the record worth reviewing later.
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  outcome      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One tag per ticker per date per type. Re-entering the same event updates it rather
-- than producing a duplicate that shows twice in the alert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalyst_tags_unique
  ON catalyst_tags (ticker, event_date, event_type);

-- The hot query is "upcoming, unresolved", which runs on every scanner page load and in
-- the nightly cron.
CREATE INDEX IF NOT EXISTS idx_catalyst_tags_upcoming
  ON catalyst_tags (event_date) WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_catalyst_tags_ticker ON catalyst_tags (ticker);

COMMENT ON TABLE catalyst_tags IS
  'Hand-entered dated events. Never purged — cannot be regenerated from market data.';
