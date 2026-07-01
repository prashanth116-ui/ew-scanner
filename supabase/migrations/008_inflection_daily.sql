-- Inflection Daily Scan results
-- Stores nightly inflection engine V2 scan results for SP500 + NDX100 universe.
-- 14-day rolling retention, purged by cron.

CREATE TABLE IF NOT EXISTS inflection_daily (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_date       DATE NOT NULL,
  ticker          TEXT NOT NULL,
  company_name    TEXT,
  price           NUMERIC(10,2) NOT NULL,
  overall_score   INTEGER NOT NULL,
  se_score        INTEGER NOT NULL DEFAULT 0,
  vc_score        INTEGER NOT NULL DEFAULT 0,
  be_score        INTEGER NOT NULL DEFAULT 0,
  rs_score        INTEGER NOT NULL DEFAULT 0,
  la_score        INTEGER NOT NULL DEFAULT 0,
  ip_score        INTEGER NOT NULL DEFAULT 0,
  stage           TEXT NOT NULL,
  trade_read      TEXT NOT NULL,
  extension_risk  BOOLEAN NOT NULL DEFAULT false,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_stronger     BOOLEAN NOT NULL DEFAULT false,
  bullish_evidence TEXT[],
  caution_evidence TEXT[],
  invalidation    NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_date, ticker)
);

CREATE INDEX idx_inflection_daily_scan_date ON inflection_daily (scan_date DESC);
CREATE INDEX idx_inflection_daily_stage ON inflection_daily (stage);
CREATE INDEX idx_inflection_daily_trade_read ON inflection_daily (trade_read);
