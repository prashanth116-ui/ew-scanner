-- EW Scanner: Initial database schema
-- Run in Supabase SQL Editor after creating your project

-- Watchlists (shared across all scanners)
create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  scanner text not null check (scanner in ('ew', 'squeeze', 'prerun')),
  name text not null,
  created_at timestamptz default now() not null
);

-- Watchlist items
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid references public.watchlists(id) on delete cascade not null,
  ticker text not null,
  name text,
  score numeric,
  added_at timestamptz default now() not null,
  metadata jsonb default '{}'::jsonb
);

-- Saved scans
create table public.saved_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  scanner text not null check (scanner in ('ew', 'squeeze', 'prerun')),
  name text not null,
  mode text,
  filters jsonb default '{}'::jsonb,
  results jsonb not null,
  tags text[] default '{}',
  notes text,
  created_at timestamptz default now() not null
);

-- User preferences (theme, default scanner, etc.)
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_scanner text default 'ew',
  preferences jsonb default '{}'::jsonb,
  updated_at timestamptz default now() not null
);

-- Row Level Security
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.saved_scans enable row level security;
alter table public.user_preferences enable row level security;

-- Policies: users can only access their own data
create policy "Users can view own watchlists"
  on public.watchlists for select
  using (auth.uid() = user_id);

create policy "Users can create own watchlists"
  on public.watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own watchlists"
  on public.watchlists for update
  using (auth.uid() = user_id);

create policy "Users can delete own watchlists"
  on public.watchlists for delete
  using (auth.uid() = user_id);

create policy "Users can view own watchlist items"
  on public.watchlist_items for select
  using (
    watchlist_id in (
      select id from public.watchlists where user_id = auth.uid()
    )
  );

create policy "Users can manage own watchlist items"
  on public.watchlist_items for all
  using (
    watchlist_id in (
      select id from public.watchlists where user_id = auth.uid()
    )
  );

create policy "Users can view own scans"
  on public.saved_scans for select
  using (auth.uid() = user_id);

create policy "Users can create own scans"
  on public.saved_scans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own scans"
  on public.saved_scans for update
  using (auth.uid() = user_id);

create policy "Users can delete own scans"
  on public.saved_scans for delete
  using (auth.uid() = user_id);

create policy "Users can manage own preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id);

-- Indexes
create index idx_watchlists_user on public.watchlists(user_id);
create index idx_watchlist_items_watchlist on public.watchlist_items(watchlist_id);
create index idx_saved_scans_user on public.saved_scans(user_id);
create index idx_saved_scans_scanner on public.saved_scans(user_id, scanner);
