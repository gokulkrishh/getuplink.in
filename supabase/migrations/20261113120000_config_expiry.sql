-- When each car's streaming config runs out (lib/alerts.ts, the header bell): Tesla's config.exp from
-- GET /api/1/vehicles/{vin}/fleet_telemetry_config, kept whenever Uplink reads it (/setup, its Check again,
-- the 6-hourly check, and the half-hourly health check for its car). After it the car stops sending data,
-- so the bell warns the owner EXPIRY_WARN_DAYS before.
--
-- Additive and safe to apply any time: a nullable column with no default, so adding it rewrites nothing
-- and takes only a brief lock. The app works without it: the expiry is read and written on its own
-- (lib/server/data/setup.ts configExpiries, saveConfigExpiry), and a missing column leaves the warning out.

alter table public.vehicles
  -- Null: not read yet, Tesla didn't answer, or the car has no config from Uplink.
  add column telemetry_config_expires_at timestamptz;

comment on column public.vehicles.telemetry_config_expires_at is 'When the car''s streaming config runs out, per fleet_telemetry_config (config.exp). Null: unknown or no config.';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.vehicles drop column if exists telemetry_config_expires_at;
