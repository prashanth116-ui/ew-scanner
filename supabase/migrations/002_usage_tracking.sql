-- Usage tracking for feature gating
-- Tracks monthly usage per user per feature

-- Subscriptions table (linked to Stripe)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  tier text not null default 'free' check (tier in ('free', 'pro', 'unlimited')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Monthly usage counters
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  usage_key text not null,
  period text not null, -- 'YYYY-MM' for monthly, 'YYYY-MM-DD' for daily
  count integer not null default 0,
  updated_at timestamptz default now() not null,
  unique(user_id, usage_key, period)
);

-- RLS
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;

-- Users can read their own subscription
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Only service role can modify subscriptions (via webhook)
-- No insert/update/delete policies for anon/authenticated — only service_role bypasses RLS

-- Users can read their own usage
create policy "Users can view own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- Users can increment their own usage
create policy "Users can insert own usage"
  on public.usage for insert
  with check (auth.uid() = user_id);

create policy "Users can update own usage"
  on public.usage for update
  using (auth.uid() = user_id);

-- Indexes
create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_stripe on public.subscriptions(stripe_customer_id);
create index idx_usage_user_key on public.usage(user_id, usage_key, period);

-- Auto-create subscription row on user signup (trigger)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, tier)
  values (new.id, 'free');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
