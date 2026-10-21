-- India EV Update Tracker: initial schema.
-- All access goes through the server with the service role key, so RLS is
-- enabled on every table with no policies (anon/authenticated get nothing).

create table public.oauth_tokens (
  provider text primary key default 'tesla',
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id bigint primary key, -- Tesla vehicle `id`
  vin text unique,
  display_name text,
  last_state text,
  current_version text,
  last_seen_at timestamptz, -- last time the car was online when polled
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.snapshots (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references public.vehicles (id) on delete cascade,
  polled_at timestamptz not null default now(),
  -- 'poll' today; 'telemetry' reserved for Fleet Telemetry later.
  source text not null default 'poll',
  state text not null, -- online / asleep / offline
  car_version text,
  update_status text,
  update_version text,
  download_perc integer,
  install_perc integer,
  expected_duration_sec integer,
  scheduled_time_ms bigint,
  error text,
  raw jsonb
);

create index snapshots_vehicle_polled_idx on public.snapshots (vehicle_id, polled_at desc);

create table public.version_history (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references public.vehicles (id) on delete cascade,
  version text not null,
  previous_version text,
  detected_at timestamptz not null default now(),
  source text not null default 'poll'
);

create index version_history_vehicle_detected_idx on public.version_history (vehicle_id, detected_at desc);

-- One row per cron/manual run, so the dashboard can surface failures.
create table public.poll_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  vehicles_seen integer,
  error text
);

alter table public.oauth_tokens enable row level security;
alter table public.vehicles enable row level security;
alter table public.snapshots enable row level security;
alter table public.version_history enable row level security;
alter table public.poll_runs enable row level security;
