-- Charging sessions rebuilt from Fleet Telemetry readings (lib/server/stream-charging.ts), so
-- AC and third-party DC charging shows up next to Tesla's own Supercharger history.
-- ended_at is null while a session is in progress. Rows are upserted on (vin, started_at).

create table public.stream_charge_sessions (
  id bigint generated always as identity primary key,
  vin text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  kind text not null check (kind in ('ac', 'dc')),
  supercharger boolean not null default false,
  energy_added_kwh numeric(8,2),            -- the car's per-session energy-in counter
  start_level numeric(5,2),                 -- battery %
  end_level numeric(5,2),
  start_energy_kwh numeric(8,2),            -- pack energy remaining
  end_energy_kwh numeric(8,2),
  peak_power_kw numeric(6,1),
  updated_at timestamptz not null default now(),
  unique (vin, started_at)
);

comment on table public.stream_charge_sessions is
  'Charging sessions derived from telemetry_readings. Not a source of cost or location data.';

create index stream_charge_sessions_vin_started_idx
  on public.stream_charge_sessions (vin, started_at desc);

alter table public.stream_charge_sessions enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.stream_charge_sessions from anon, authenticated;
revoke all on sequence public.stream_charge_sessions_id_seq from anon, authenticated;
