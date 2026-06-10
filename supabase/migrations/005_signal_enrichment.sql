-- Add enrichment columns to signal_outcomes for prerun earnings + RS data
ALTER TABLE public.signal_outcomes
  ADD COLUMN IF NOT EXISTS days_to_earnings integer,
  ADD COLUMN IF NOT EXISTS next_earnings_date date,
  ADD COLUMN IF NOT EXISTS relative_strength_20d numeric;
