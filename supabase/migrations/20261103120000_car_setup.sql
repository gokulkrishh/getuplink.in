-- Setup status per car (app/setup, lib/server/setup.ts): whether Uplink's virtual key is on the car, and
-- whether the car streams to Uplink, as Tesla last said, with when it was asked. Uplink reads these instead
-- of asking Tesla on every page view: the key at most every 10 minutes (once a day once it's on), streaming
-- only on /setup, "Check again" and the 6-hourly check.
--
-- Safe to apply any time: the app works without these columns. Until they exist nobody is sent to /setup,
-- and /setup asks Tesla each time it's opened.

alter table public.vehicles
  -- From POST /api/1/vehicles/fleet_status: true when listed in key_paired_vins, false in unpaired_vins.
  -- Null: not asked yet, or Tesla's answer didn't say (never sends anyone to /setup).
  add column key_paired boolean,
  -- When fleet_status was last asked for this car, answered or not.
  add column key_checked_at timestamptz,
  -- From GET /api/1/vehicles/{vin}/fleet_telemetry_config: 'synced' (the car runs Uplink's config),
  -- 'pending' (it has one it hasn't picked up yet), 'none', or 'full' (the car has no room for another
  -- app's config). Null: not asked yet, or Tesla didn't answer.
  add column streaming text check (streaming is null or streaming in ('synced', 'pending', 'none', 'full')),
  add column streaming_checked_at timestamptz,
  -- When Uplink last sent this car its streaming config itself (fleet_telemetry_config_jws).
  add column telemetry_config_sent_at timestamptz;

comment on column public.vehicles.key_paired is 'Uplink''s virtual key is on the car, per Tesla''s fleet_status. Null: unknown.';
comment on column public.vehicles.streaming is 'Streaming config state per fleet_telemetry_config: synced, pending, none or full. Null: unknown.';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.vehicles drop column if exists telemetry_config_sent_at, drop column if exists streaming_checked_at,
--     drop column if exists streaming, drop column if exists key_checked_at, drop column if exists key_paired;
