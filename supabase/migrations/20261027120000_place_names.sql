-- Names for the places the car parks, from OpenStreetMap's Nominatim, looked up once per spot and kept.
-- Keyed by the point rounded to 3 decimals (about 100 m), the size of a place on the Driving page.

create table public.place_names (
  key text primary key,          -- "12.935,77.625"
  name text,                     -- e.g. "Koramangala, Bengaluru"; null when Nominatim had none
  looked_up_at timestamptz not null default now()
);

alter table public.place_names enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.place_names from anon, authenticated;

-- Rollback (manual, not run):
--   drop table if exists public.place_names;
