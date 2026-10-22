-- Owner settings: charging rates in ₹/kWh, so Stats can price charging Tesla doesn't bill
-- (home AC and third-party DC). One row, like oauth_tokens. A null rate means "not set".

create table public.owner_settings (
  owner text primary key default 'tesla' check (owner = 'tesla'),
  home_rate_inr numeric(5,2) check (home_rate_inr is null or (home_rate_inr > 0 and home_rate_inr <= 100)),
  other_rate_inr numeric(5,2) check (other_rate_inr is null or (other_rate_inr > 0 and other_rate_inr <= 100)),
  updated_at timestamptz not null default now()
);

alter table public.owner_settings enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.owner_settings from anon, authenticated;

-- Rollback (manual, not run):
--   drop table if exists public.owner_settings;
