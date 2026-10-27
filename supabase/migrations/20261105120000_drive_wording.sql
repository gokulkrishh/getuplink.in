-- The drive page's words written by AI ("How this drive went" and the line under each chart), once per
-- drive, from the figures lib/drive-facts.ts builds (lib/server/drive-wording.ts writes and reads them).
--
-- Additive. The app works before this runs: the page reads no table, shows its code sentences, and never
-- calls the model (it only calls once it can store the result). Apply it any time.
--
-- One row per owner, car, drive start and scope ('trip' for drives with short stops between, 'drive' for
-- one drive or one leg, which can start when its trip does). facts_hash is a SHA-256 of the facts, the
-- prompt version and the model: when it no longer matches, the page shows the code sentences and writes
-- the wording again. wording holds only lines that passed the checks in lib/drive-wording.ts, e.g.
-- { "summary": "...", "speed": "..." }; {} when none did.

create table public.drive_wording (
  user_id bigint not null references public.users (id) on delete cascade,
  vehicle_id bigint not null,            -- the Tesla vehicle id, as in vehicles.id
  drive_start timestamptz not null,
  scope text not null check (scope in ('trip', 'drive')),
  facts_hash text not null check (length(facts_hash) = 64),
  wording jsonb not null check (jsonb_typeof(wording) = 'object'),
  model text not null check (length(model) between 1 and 100),
  cost_usd numeric(10, 6) check (cost_usd >= 0), -- OpenRouter's figure for the call; null if it sent none
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id, drive_start, scope)
);

comment on table public.drive_wording is
  'AI-written words for the drive page, from figures only (no places or identifiers). Per user; service role only.';

alter table public.drive_wording enable row level security;
-- No policies: only the service-role key (server side) can read or write, like the other owner tables.
revoke all on table public.drive_wording from anon, authenticated;

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   drop table if exists public.drive_wording;
