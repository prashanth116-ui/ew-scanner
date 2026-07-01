-- Add sector column to inflection_daily for sector clustering analysis.
ALTER TABLE inflection_daily ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT '';
