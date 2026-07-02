-- Add market environment component breakdown (same for all rows on a given date)
ALTER TABLE qfe_daily ADD COLUMN IF NOT EXISTS market_env_detail JSONB;
