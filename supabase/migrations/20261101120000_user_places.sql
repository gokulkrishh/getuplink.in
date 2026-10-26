-- Your places: the owner's own names for spots ("Name this place"), one row per tag. A visit or a charge
-- within radius_m of a tag takes its name, ahead of every other source (lib/charge-names.ts). Read and
-- written only through lib/server/user-places.ts, always scoped to the signed-in user.
--
-- The app works before this runs: reads see no table and show no tags; saving says it can't yet.

create table public.user_places (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 75 check (radius_m between 10 and 500),
  -- Set when the name was a Google suggestion the owner confirmed. Google lets place IDs be kept
  -- indefinitely; the app keeps such a name off its (non-Google) map. Null for a typed name.
  google_place_id text check (google_place_id is null or length(google_place_id) <= 300),
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

-- Rollback (manual, not run):
--   drop table if exists public.user_places;
