-- Discovery layer: auto-discovered trending/pumping tickers
-- Merged into static scanner universes at scan time

CREATE TABLE IF NOT EXISTS discovered_tickers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol        TEXT NOT NULL,
  name          TEXT,
  asset_class   TEXT NOT NULL CHECK (asset_class IN ('stock', 'crypto')),
  source        TEXT NOT NULL,
  price_change_pct  DOUBLE PRECISION,
  volume            BIGINT,
  market_cap        BIGINT,
  price_at_discovery DOUBLE PRECISION,
  discovered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Upsert conflict target
ALTER TABLE discovered_tickers
  ADD CONSTRAINT discovered_tickers_symbol_asset_class_key
  UNIQUE (symbol, asset_class);

-- Query indexes
CREATE INDEX idx_discovered_tickers_asset_class ON discovered_tickers (asset_class);
CREATE INDEX idx_discovered_tickers_expires_at ON discovered_tickers (expires_at);
CREATE INDEX idx_discovered_tickers_last_seen_at ON discovered_tickers (last_seen_at);
