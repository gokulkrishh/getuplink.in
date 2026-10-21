-- Charger and battery-temperature details for streamed charging sessions
-- (lib/charge-sessions.ts). All nullable: older rows and cars that don't send a field stay null.
-- Adding nullable columns without defaults is a metadata-only change, so it takes no table rewrite.

alter table public.stream_charge_sessions
  add column ac_voltage numeric(6,1),   -- V, median while charging (AC sessions)
  add column ac_amps numeric(6,1),      -- A, highest while charging (AC sessions)
  add column ac_phases smallint,        -- most common phase count while charging (AC sessions)
  add column cable_type text,           -- last cable seen, e.g. IEC, SAE, GB_AC
  add column temp_max_c numeric(5,1),   -- highest ModuleTempMax during the session
  add column temp_start_c numeric(5,1); -- ModuleTempMax at or just before the start
