-- Admin > Costs (docs/costs.md): what running Uplink costs.
--
-- Additive. /admin/costs renders before this is applied: fixed entries read as "Not set", the rate falls
-- back to USD_INR, and saving says to apply this migration first.

-- 1. Fixed and manual costs. The built-in services (Fly.io, Supabase, the domain) have one row each, keyed
-- by `service`; rows the owner adds have no service. Amounts are in their own currency, for the period.
create table if not exists public.cost_entries (
  id bigint generated always as identity primary key,
  service text
    constraint cost_entries_service_check check (service in ('fly', 'supabase', 'domain')),
  name text not null
    constraint cost_entries_name_check check (length(name) between 1 and 80),
  amount numeric(12, 2) not null
    constraint cost_entries_amount_check check (amount >= 0),
  currency text not null
    constraint cost_entries_currency_check check (currency in ('INR', 'USD')),
  period text not null
    constraint cost_entries_period_check check (period in ('monthly', 'yearly')),
  renews_on date,
  -- Rendered as an href on the admin page, so only https links (no javascript: and the like).
  link text
    constraint cost_entries_link_check check (link is null or (link ~ '^https://' and length(link) <= 500)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per built-in service. Nulls are distinct, so any number of owner-added rows have none.
  constraint cost_entries_service_key unique (service)
);

comment on table public.cost_entries is 'Fixed and manual costs for /admin/costs. Service role only.';

-- 2. Settings and last known values, one row per key:
--   usd_inr            {"rate": 84}            rupees to a dollar, set on the page
--   google_budget_usd  {"usd": 5}              the Google Maps budget for the over-budget warning
--   snapshot:vercel    {"amount": 1.2, "plan": "pro", "fetchedAt": "..."}   the last live read, shown when a call fails
create table if not exists public.cost_settings (
  key text primary key
    constraint cost_settings_key_check check (key in ('usd_inr', 'google_budget_usd', 'snapshot:vercel')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.cost_settings is 'Exchange rate, budgets and last live values for /admin/costs. Service role only.';

-- RLS on with no policies: only the service-role key (server side) can read or write.
alter table public.cost_entries enable row level security;
alter table public.cost_settings enable row level security;
revoke all on table public.cost_entries from anon, authenticated;
revoke all on table public.cost_settings from anon, authenticated;

-- Rollback (manual, not run):
--   drop table if exists public.cost_settings;
--   drop table if exists public.cost_entries;
