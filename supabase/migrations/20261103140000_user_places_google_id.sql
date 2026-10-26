-- A saved place can be a Google Maps place: the owner taps a Google suggestion in "Name this place", and
-- only its place ID is kept. Google's terms let us store place IDs indefinitely and nothing else from the
-- Places API, so the name is fetched live each time a row shows it (lib/server/google-place-names.ts).
-- docs/place-names.md has the terms.
--
-- Additive. The app works before this runs: reads use "*" and see no google_place_id, Google suggestions
-- stay read-only (the sheet checks for the column), and saving a Google place says it isn't ready yet.

alter table public.user_places
  add column google_place_id text check (google_place_id ~ '^[A-Za-z0-9_-]+$' and length(google_place_id) between 10 and 1000);

alter table public.user_places alter column name drop not null;

-- A row is named one way: a typed name, or a Google place ID. Never both, never neither.
alter table public.user_places
  add constraint user_places_one_name check (num_nonnulls(name, google_place_id) = 1);

comment on column public.user_places.google_place_id is
  'A Google Maps place ID the owner picked. Only the ID is stored (Places API policies); the name is fetched live and never kept.';

-- Rollback (manual, not run). Delete the Google-named rows first, since name becomes required again:
--   delete from public.user_places where name is null;
--   alter table public.user_places drop constraint if exists user_places_one_name;
--   alter table public.user_places alter column name set not null;
--   alter table public.user_places drop column if exists google_place_id;
