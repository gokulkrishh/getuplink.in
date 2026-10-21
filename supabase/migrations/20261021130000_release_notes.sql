-- Release notes per firmware version, fetched from Tesla once per version while the car is online.
-- Notes are the same for every car on a version, so they are keyed by version, not vehicle.
create table public.release_notes (
  version text primary key,
  notes jsonb not null default '[]'::jsonb, -- [{ title, subtitle?, description? }]
  raw jsonb, -- Tesla's response, kept because the format is undocumented
  fetched_at timestamptz not null default now()
);

alter table public.release_notes enable row level security;
