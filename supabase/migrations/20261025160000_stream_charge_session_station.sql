-- The charging station a streamed session happened at, such as "Statiq, Koramangala", from
-- OpenStreetMap (lib/stations.ts). Only the name is stored, never coordinates: the 15-minute station
-- check (lib/server/station-check.ts) reads the car's location while it charges, matches it in memory
-- and drops it. Nullable, no defaults: a metadata-only change.

alter table public.stream_charge_sessions
  add column station_name text,              -- null: no station within reach, or not checked yet
  add column station_checked_at timestamptz; -- set on the one attempt per session, so it isn't retried

-- Rollback (manual, not run):
--   alter table public.stream_charge_sessions drop column if exists station_checked_at, drop column if exists station_name;
