CREATE TABLE theme_events (
  id            BIGSERIAL PRIMARY KEY,
  url_hash      TEXT NOT NULL,
  theme_id      TEXT NOT NULL,
  headline      TEXT NOT NULL,
  summary       TEXT,
  source        TEXT NOT NULL,
  source_url    TEXT,
  published_at  TIMESTAMPTZ NOT NULL,
  ingested_at   TIMESTAMPTZ DEFAULT NOW(),
  impact_score  INT NOT NULL DEFAULT 0,
  impacted_tickers TEXT[] DEFAULT '{}',
  impacted_etfs TEXT[] DEFAULT '{}',
  expired       BOOLEAN DEFAULT FALSE,
  UNIQUE(url_hash, theme_id)
);

CREATE INDEX idx_theme_events_published ON theme_events(published_at DESC);
CREATE INDEX idx_theme_events_theme ON theme_events(theme_id);
CREATE INDEX idx_theme_events_impact ON theme_events(impact_score DESC);
