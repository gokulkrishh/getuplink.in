-- Your places: the owner's own names for spots ("Name this place"), and a count of the Google calls the
-- naming sheet makes, for Admin > Costs. docs/place-names.md has the rules.
--
-- Additive. The app works before this runs: reads see no table and show no tags, saving says it can't
-- yet, and Google calls go uncounted ("Not tracked yet" on the costs page). Apply it any time; calls made
-- before it are not counted.

-- 1. One row per tag. A visit or a charge within radius_m of a tag takes its name, ahead of every other
-- source (lib/charge-names.ts). The name is always one the owner typed, or OpenStreetMap's they picked;
-- never Google's. Read and written only through lib/server/user-places.ts, scoped to the signed-in user.
create table public.user_places (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 75 check (radius_m between 10 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_places is
  'Owner-named places: a name, a point and a radius in metres. Per user; service role only.';

-- Nearby lookups: an owner's tags by position. Leading user_id also serves the foreign key and the
-- per-owner reads and deletes (Delete my data). An owner has tens of tags, so a btree is plenty; no PostGIS.
create index user_places_user_lat_lng_idx on public.user_places (user_id, lat, lng);

alter table public.user_places enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.user_places from anon, authenticated;
revoke all on sequence public.user_places_id_seq from anon, authenticated;

-- 2. Google Maps Platform calls per UTC month and SKU (lib/costs.ts GOOGLE_SKUS), for the account's bill.
-- No user: the bill is the account's, and a count holds nothing about anyone.
create table public.google_usage (
  month date not null check (extract(day from month) = 1),
  sku text not null check (length(sku) between 1 and 40),
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (month, sku)
);

comment on table public.google_usage is
  'Google Maps Platform calls Uplink made, per UTC month and SKU. Uplink''s own count; Google''s billing page is the source of truth.';

alter table public.google_usage enable row level security;
revoke all on table public.google_usage from anon, authenticated;

-- Adds p_n to this month's count for the SKU, atomically.
create function public.increment_google_usage(p_sku text, p_n integer default 1)
returns void
language sql
set search_path = ''
as $$
  insert into public.google_usage (month, sku, count)
  values (date_trunc('month', now() at time zone 'utc')::date, p_sku, p_n)
  on conflict (month, sku)
  do update set count = public.google_usage.count + excluded.count, updated_at = now();
$$;

revoke all on function public.increment_google_usage(text, integer) from public, anon, authenticated;
grant execute on function public.increment_google_usage(text, integer) to service_role;

-- Rollback (manual, not run):
--   drop function if exists public.increment_google_usage(text, integer);
--   drop table if exists public.google_usage;
--   drop table if exists public.user_places;
