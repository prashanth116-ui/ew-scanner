-- Promoted tickers: discovered tickers that scored well (WATCH+) get permanent universe inclusion.
-- 180-day TTL, re-promotion resets expiry.

CREATE TABLE IF NOT EXISTS promoted_tickers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol            TEXT NOT NULL,
  name              TEXT,
  asset_class       TEXT NOT NULL CHECK (asset_class IN ('stock', 'crypto')),
  sector            TEXT,
  promoted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_qualified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  best_score        INTEGER NOT NULL DEFAULT 0,
  best_verdict      TEXT,
  source            TEXT NOT NULL DEFAULT 'discovery',
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '180 days')
);

ALTER TABLE promoted_tickers
  ADD CONSTRAINT promoted_tickers_symbol_asset_class_key
  UNIQUE (symbol, asset_class);

CREATE INDEX idx_promoted_tickers_asset_class ON promoted_tickers (asset_class);
CREATE INDEX idx_promoted_tickers_expires_at ON promoted_tickers (expires_at);
