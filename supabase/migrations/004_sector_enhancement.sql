-- Institutional ownership cache (weekly refresh)
CREATE TABLE IF NOT EXISTS public.stock_institutional_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  institutional_pct numeric,
  last_updated timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inst_cache_updated ON public.stock_institutional_cache(last_updated);

-- Extend sector_snapshots for new categories
ALTER TABLE public.sector_snapshots
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'gics_sector';
