-- The Owners page (/owners): how owners in India use their cars, as totals across the cars of owners who
-- share. Opt-in, separate from sign-in: users.share_with_owners is off until the owner turns it on
-- (/owners or Settings), and turning it off deletes their day rows at once.
--
-- fleet_car_days: one row per shared car and IST day, the day's figures worked out from the car's readings
-- by the daily owners run (lib/server/owners.ts, app/api/cron/owners). Sums only (km, kWh, minutes), so 30
-- days add up; the latest settings ride on the newest rows. Never shown to anyone as one car's: the run
-- reduces them to totals across at least 5 cars (lib/owners.ts aggregate). vin_hash is an HMAC of the VIN,
-- so a car two accounts share counts once. Kept 35 days.
--
-- Keyed (user_id, vehicle_id, day), not (vehicle_id, day): since shared_cars two accounts can track the same
-- Tesla vehicle id, and one account's write must never take over or delete the other's row.
--
-- fleet_stats: one row per run, the published totals (binned counts, shares and rounded ranges, never a
-- car's own figures). The page reads the newest.
--
-- Additive. The app works before this runs: Owners shows the sharing box, Settings shows sharing off, and
-- the run skips.

alter table public.users add column if not exists share_with_owners boolean not null default false;
alter table public.users add column if not exists shared_since timestamptz;

comment on column public.users.share_with_owners is 'Opted in to add their cars'' figures to the Owners totals.';
comment on column public.users.shared_since is 'When sharing was last turned on; null while off.';

create table public.fleet_car_days (
  user_id bigint not null,
  vehicle_id bigint not null,            -- the Tesla vehicle id, as in vehicles.id
  vin_hash text not null check (length(vin_hash) = 64),
  day date not null,                     -- the IST day
  figures jsonb not null check (jsonb_typeof(figures) = 'object'),
  computed_at timestamptz not null default now(),
  primary key (user_id, vehicle_id, day),
  foreign key (user_id, vehicle_id) references public.vehicles (user_id, id) on delete cascade
);

-- The run's read of every shared day in the window, and its prune.
create index fleet_car_days_day_idx on public.fleet_car_days (day);

comment on table public.fleet_car_days is
  'Per shared car and IST day, figures for the Owners totals. Per user; service role only; kept 35 days.';

alter table public.fleet_car_days enable row level security;
-- No policies: only the service-role key (server side) can read or write, like the other owner tables.
revoke all on table public.fleet_car_days from anon, authenticated;

create table public.fleet_stats (
  id bigint generated always as identity primary key,
  computed_at timestamptz not null default now(),
  cars integer not null check (cars >= 0),
  stats jsonb not null check (jsonb_typeof(stats) = 'object')
);

create index fleet_stats_computed_at_idx on public.fleet_stats (computed_at desc);

comment on table public.fleet_stats is 'The Owners page''s totals, one row per run. No car''s own figures; service role only.';

alter table public.fleet_stats enable row level security;
revoke all on table public.fleet_stats from anon, authenticated;
revoke all on sequence public.fleet_stats_id_seq from anon, authenticated;

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   drop table if exists public.fleet_stats;
--   drop table if exists public.fleet_car_days;
--   alter table public.users drop column if exists shared_since, drop column if exists share_with_owners;
