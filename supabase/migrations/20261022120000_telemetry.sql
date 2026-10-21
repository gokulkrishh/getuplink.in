-- Raw Fleet Telemetry readings, written by the Fly receiver (fly/telemetry) with the service-role key.
-- One row per (vehicle, signal, timestamp). Raw rows are meant to be kept ~30 days; a retention
-- job comes later, once session/derived tables exist.

create table public.telemetry_readings (
  id bigint generated always as identity primary key,
  vin text not null,
  created_at timestamptz not null,          -- timestamp the car reported (record CreatedAt)
  received_at timestamptz not null default now(),
  field text not null,                      -- Tesla Field enum name, e.g. Soc, DetailedChargeState
  value jsonb not null
);

comment on table public.telemetry_readings is
  'Raw Fleet Telemetry signals. Keep ~30 days; retention job to be added.';

create index telemetry_readings_vin_field_created_idx
  on public.telemetry_readings (vin, field, created_at desc);

alter table public.telemetry_readings enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.telemetry_readings from anon, authenticated;
revoke all on sequence public.telemetry_readings_id_seq from anon, authenticated;
