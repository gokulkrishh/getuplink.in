-- Step 5 of docs/signup-plan.md: count Tesla Fleet API usage, and check each user on their own schedule.
-- Prices and what is ambiguous about them: docs/tesla-billing.md.
--
-- Additive, and safe under the code deployed before it, which reads none of it, with one exception: the
-- check lock becomes one per user (5). The old code inserts poll_runs with the default user_id (the
-- legacy owner), so it still takes one lock at a time.
-- The new code works before this is applied: it logs once and counts nothing, and checks stay every
-- 6 hours (gated on the last poll_runs start). Apply it before or right after deploying that code.

-- 1. Requests per user, per UTC month, per Uplink kind (lib/tesla-billing.ts KINDS, mapped to Tesla's
-- categories in code, so a change in Tesla's categories needs no data change).
-- user_id 0 is unattributed: a sign-up's region check, before the user has an approved account, and the
-- counts of deleted accounts (fold_api_usage). No foreign key, so deleting an account can't take its
-- spend out of the developer account's month: the counts are folded into 0 instead.
create table public.api_usage (
  user_id bigint not null check (user_id >= 0),
  month date not null check (extract(day from month) = 1),
  kind text not null check (length(kind) between 1 and 40),
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month, kind)
);

comment on table public.api_usage is
  'Fleet API requests Uplink made, per user (0 = unattributed), UTC month and kind. Uplink''s own count; Tesla''s billing page is the source of truth.';

-- The developer account's month: every user's rows for one month.
create index api_usage_month_idx on public.api_usage (month);

alter table public.api_usage enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.api_usage from anon, authenticated;

-- Adds p_n to this month's count, atomically: concurrent requests each add theirs.
create function public.increment_api_usage(p_user_id bigint, p_kind text, p_n integer default 1)
returns void
language sql
set search_path = ''
as $$
  insert into public.api_usage (user_id, month, kind, count)
  values (p_user_id, date_trunc('month', now() at time zone 'utc')::date, p_kind, p_n)
  on conflict (user_id, month, kind)
  do update set count = public.api_usage.count + excluded.count, updated_at = now();
$$;

revoke all on function public.increment_api_usage(bigint, text, integer) from public, anon, authenticated;
grant execute on function public.increment_api_usage(bigint, text, integer) to service_role;

-- Delete account: moves the user's counts into user 0, in one statement each, inside one function call.
create function public.fold_api_usage(p_user_id bigint)
returns void
language sql
set search_path = ''
as $$
  insert into public.api_usage (user_id, month, kind, count)
  select 0, month, kind, count from public.api_usage where user_id = p_user_id and p_user_id <> 0
  on conflict (user_id, month, kind)
  do update set count = public.api_usage.count + excluded.count, updated_at = now();
  delete from public.api_usage where user_id = p_user_id and p_user_id <> 0;
$$;

revoke all on function public.fold_api_usage(bigint) from public, anon, authenticated;
grant execute on function public.fold_api_usage(bigint) to service_role;

-- 2. Streamed signals per VIN per UTC day: telemetry_readings rows, by when they were received. Set by
-- count_telemetry_signals from the daily retention cron, before it prunes.
create table public.telemetry_signal_days (
  vin text not null,
  day date not null,
  signals bigint not null check (signals >= 0),
  counted_at timestamptz not null default now(),
  primary key (vin, day)
);

comment on table public.telemetry_signal_days is
  'Streamed telemetry rows received per VIN per UTC day: Uplink''s count of Tesla''s billed streaming signals (a slight undercount).';

-- A month's signals: every VIN's days in it.
create index telemetry_signal_days_day_idx on public.telemetry_signal_days (day);

alter table public.telemetry_signal_days enable row level security;
revoke all on table public.telemetry_signal_days from anon, authenticated;

-- Recounts the last p_days UTC days (today included) and SETS each (vin, day), so running it twice counts
-- nothing twice, and a day recounted later picks up rows that arrived late. One scan of those days' rows
-- (no index on received_at: the table is write-heavy, and this runs once a day). Returns the rows written.
create function public.count_telemetry_signals(p_days integer default 3)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz := (date_trunc('day', now() at time zone 'utc') - make_interval(days => greatest(p_days, 1) - 1)) at time zone 'utc';
  v_rows integer;
begin
  insert into public.telemetry_signal_days (vin, day, signals, counted_at)
  select vin, (received_at at time zone 'utc')::date, count(*), now()
  from public.telemetry_readings
  where received_at >= v_since
  group by 1, 2
  on conflict (vin, day) do update set signals = excluded.signals, counted_at = excluded.counted_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.count_telemetry_signals(integer) from public, anon, authenticated;
grant execute on function public.count_telemetry_signals(integer) to service_role;

-- 3. Each user's check schedule (lib/server/poll.ts). Null means due now.
alter table public.users
  add column if not exists next_check_at timestamptz,
  -- Claimed with a conditional update before a check; cleared after it. A crashed check frees itself.
  add column if not exists check_lock_until timestamptz,
  -- The last on-demand check (the one after a sign-in), for the once-per-5-minutes limit.
  add column if not exists check_now_at timestamptz;

comment on column public.users.next_check_at is 'When the cron next checks this user''s cars. Null: due now.';
comment on column public.users.check_lock_until is 'A check holds this user until then (per-user lock).';
comment on column public.users.check_now_at is 'When the last on-demand check started (at most one per 5 minutes).';

-- 4. (Nothing to index on users: at most MAX_USERS rows.)

-- 5. The check lock, one per user: at most one unfinished poll_runs row per user_id. Every existing row
-- has a user_id (the column defaults to the legacy owner), and at most one is unfinished.
create unique index poll_runs_one_running_per_user_idx on public.poll_runs (user_id) where finished_at is null;
drop index public.poll_runs_one_running_idx;

-- Down:
--   create unique index poll_runs_one_running_idx on public.poll_runs ((true)) where finished_at is null;
--   drop index public.poll_runs_one_running_per_user_idx;
--   alter table public.users drop column next_check_at, drop column check_lock_until, drop column check_now_at;
--   drop function public.count_telemetry_signals(integer);
--   drop table public.telemetry_signal_days;
--   drop function public.fold_api_usage(bigint);
--   drop function public.increment_api_usage(bigint, text, integer);
--   drop table public.api_usage;
