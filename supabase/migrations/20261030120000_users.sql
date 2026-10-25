-- Step 2 of docs/signup-plan.md: accounts become users, and every per-user row names its user.
--
-- Written to run under the code that's deployed today, which knows nothing of users: it never sets
-- user_id, so every user_id column defaults to the legacy owner (the user whose Tesla account is
-- oauth_tokens.owner_sub). The owner's cars, history and settings stay where they are, keyed as before;
-- they only gain a user_id. Nothing here changes a row the old code reads or a key it writes on.
--
-- What stays for later steps (see docs/signup-plan.md):
--   * user_tokens starts empty. Tesla refresh tokens are single use, so a copy would go stale (and revoke
--     the chain if used) the moment the old code refreshes. Step 3 copies oauth_tokens' pair under the
--     refresh lease at cutover, then reads and writes only user_tokens.
--   * The old keys that stop two users tracking the same car (vehicles' id and vin, charging_sessions'
--     session_id, stream_charge_sessions' (vin, started_at), telemetry_readings' (vin, field, created_at),
--     the 'tesla' single-row checks) stay until step 4 swaps them for per-user ones.
--   * telemetry_readings gets its user_id but no foreign key, NOT NULL or index yet: it is the one large,
--     write-heavy table, and the Fly receiver writes it without a user. Those come with the receiver
--     change in step 4.
--
-- Rollback (manual, not run) is at the end.

-- 1. Users: one per Tesla login. Sign-up asks for an email and lands on the waitlist (step 6); the owner
-- approves. The existing owner is approved, with no email until they add one.
create table public.users (
  id bigint generated always as identity primary key,
  tesla_sub text not null unique,          -- Tesla id_token `sub`
  email text check (email is null or (length(email) <= 320 and email like '%_@_%')),
  status text not null default 'waitlist' check (status in ('waitlist', 'approved', 'declined', 'suspended')),
  -- Sessions issued before this are revoked ("Sign out everywhere"). Copied from oauth_tokens below, and
  -- again at step 3's cutover, since the old code keeps writing the oauth_tokens one until then.
  sessions_valid_after timestamptz not null default '-infinity',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  -- The waitlist is how Uplink reaches someone, so a waitlisted user always has an email.
  constraint users_waitlist_email_check check (status <> 'waitlist' or email is not null)
);

comment on table public.users is
  'One per Tesla login. status: waitlist (signed up, waiting), approved (can use Uplink), declined, suspended.';

-- One account per email, however it is capitalised.
create unique index users_email_key on public.users (lower(email)) where email is not null;
-- The owner's waitlist view: who is waiting, oldest first.
create index users_status_created_idx on public.users (status, created_at);

alter table public.users enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.users from anon, authenticated;
revoke all on sequence public.users_id_seq from anon, authenticated;

-- 2. Per-user Tesla tokens, replacing oauth_tokens' single row in step 3 (left empty until then; see top).
create table public.user_tokens (
  user_id bigint primary key references public.users (id) on delete cascade,
  access_token_enc text,                   -- null while disconnected
  refresh_token_enc text,
  expires_at timestamptz,
  scope text,
  refreshing_until timestamptz,            -- the refresh lease (see 20261028120000_token_refresh_lease.sql)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_tokens_pair_check check ((access_token_enc is null) = (refresh_token_enc is null))
);

alter table public.user_tokens enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.user_tokens from anon, authenticated;

-- 3. The existing owner becomes the first user.
insert into public.users (tesla_sub, status, sessions_valid_after, created_at, approved_at)
select t.owner_sub, 'approved', t.sessions_valid_after, t.created_at, now()
from public.oauth_tokens t
where t.provider = 'tesla' and t.owner_sub is not null
on conflict (tesla_sub) do nothing;

-- Data without an owner to give it to would get a null user_id below and fail NOT NULL with an unclear
-- message; stop here with a clear one instead. (Can't happen on a database the app made: rows only arrive
-- after a sign-in, and owner_sub is never cleared.)
do $$
begin
  if not exists (select 1 from public.users)
     and (exists (select 1 from public.vehicles) or exists (select 1 from public.telemetry_readings limit 1)) then
    raise exception 'Car data exists but oauth_tokens has no owner_sub to give it to';
  end if;
end
$$;

-- 4. The legacy owner's user id: the default for every user_id column while the old code, which never sets
-- one, is deployed. Step 4 drops the defaults and this function with oauth_tokens.
create function public.legacy_owner_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select u.id
  from public.oauth_tokens t
  join public.users u on u.tesla_sub = t.owner_sub
  where t.provider = 'tesla'
$$;

revoke all on function public.legacy_owner_id() from public, anon, authenticated;
grant execute on function public.legacy_owner_id() to service_role;

-- A first sign-in on a fresh database (local dev, a new project) claims oauth_tokens with the old code;
-- this gives that account its user, so the defaults above have someone to point at. It only ever adds a
-- users row: tokens stay in oauth_tokens (see top).
create function public.legacy_owner_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_sub is not null then
    insert into public.users (tesla_sub, status, approved_at)
    values (new.owner_sub, 'approved', now())
    on conflict (tesla_sub) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.legacy_owner_user() from public, anon, authenticated;

create trigger oauth_tokens_legacy_owner_user
  after insert or update of owner_sub on public.oauth_tokens
  for each row execute function public.legacy_owner_user();

-- 5. user_id on every per-user table. A non-volatile default is evaluated once, when the column is added,
-- and kept as the value of every existing row: no table rewrite, and the backfill is that one evaluation.
-- After this, rows the old code inserts get the default too.
alter table public.vehicles               add column user_id bigint not null default public.legacy_owner_id();
alter table public.snapshots              add column user_id bigint not null default public.legacy_owner_id();
alter table public.version_history        add column user_id bigint not null default public.legacy_owner_id();
alter table public.charging_sessions      add column user_id bigint not null default public.legacy_owner_id();
alter table public.stream_charge_sessions add column user_id bigint not null default public.legacy_owner_id();
alter table public.charge_receipts        add column user_id bigint not null default public.legacy_owner_id();
alter table public.connector_token        add column user_id bigint not null default public.legacy_owner_id();
-- Nullable: today's check lock is one run for every account (step 5 makes it per user).
alter table public.poll_runs              add column user_id bigint default public.legacy_owner_id();
-- Nullable and unchecked for now (see top): the receiver doesn't send it.
alter table public.telemetry_readings     add column user_id bigint default public.legacy_owner_id();

-- One connector token per user (the single 'tesla' row it holds today).
create unique index connector_token_user_key on public.connector_token (user_id);

-- 6. Keys that let a row name its user's car, and nobody else's. The tables are small apart from
-- telemetry_readings, which is left out (see top).
create unique index vehicles_user_id_key on public.vehicles (user_id, id);
create unique index vehicles_user_vin_key on public.vehicles (user_id, vin);
create unique index stream_charge_sessions_user_id_key on public.stream_charge_sessions (user_id, id);

-- Per-user reads (step 3), and the cascades below.
create index snapshots_user_vehicle_polled_idx on public.snapshots (user_id, vehicle_id, polled_at desc);
create index snapshots_user_online_polled_idx on public.snapshots (user_id, polled_at desc) where state = 'online';
create index version_history_user_vehicle_idx on public.version_history (user_id, vehicle_id, detected_at desc);
create index charging_sessions_user_started_idx on public.charging_sessions (user_id, started_at desc);
create index stream_charge_sessions_user_vin_started_idx on public.stream_charge_sessions (user_id, vin, started_at desc);
create index charge_receipts_user_idx on public.charge_receipts (user_id);
create index poll_runs_user_started_idx on public.poll_runs (user_id, started_at desc);

-- 7. Foreign keys. Each is added NOT VALID (no scan under the lock), then validated (a scan that doesn't
-- block reads or writes). New rows are checked from the moment each is added.

-- Every row belongs to a user, and goes with them when they delete their account (step 3).
do $$
declare
  t text;
begin
  foreach t in array array['vehicles', 'snapshots', 'version_history', 'charging_sessions', 'stream_charge_sessions',
                           'charge_receipts', 'connector_token', 'poll_runs']
  loop
    execute format(
      'alter table public.%1$I add constraint %1$s_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade not valid',
      t);
    execute format('alter table public.%1$I validate constraint %1$s_user_id_fkey', t);
  end loop;
end
$$;

-- A snapshot or version change can only point at a car of the same user. These sit beside the old
-- vehicle_id foreign keys, which stay until step 4.
alter table public.snapshots
  add constraint snapshots_user_vehicle_fkey foreign key (user_id, vehicle_id)
  references public.vehicles (user_id, id) on delete cascade not valid;
alter table public.snapshots validate constraint snapshots_user_vehicle_fkey;

alter table public.version_history
  add constraint version_history_user_vehicle_fkey foreign key (user_id, vehicle_id)
  references public.vehicles (user_id, id) on delete cascade not valid;
alter table public.version_history validate constraint version_history_user_vehicle_fkey;

-- An invoice can only be attached to the same user's charging session. No action rather than restrict:
-- it is checked at the end of the statement, so deleting a user (which cascades to both tables) can pass.
-- The old session_id key is restrict and still refuses that, so until step 4 swaps it, Delete account
-- deletes the invoices first, as Delete my data does.
alter table public.charge_receipts
  add constraint charge_receipts_user_session_fkey foreign key (user_id, session_id)
  references public.stream_charge_sessions (user_id, id) on delete no action not valid;
alter table public.charge_receipts validate constraint charge_receipts_user_session_fkey;

-- Charging sessions name their car by VIN. A foreign key would refuse a session written before its car's
-- row (the poll syncs Supercharger history alongside the car it is adding), so a check refuses only a VIN
-- that is another user's car and not this user's: rows can't point at someone else's car.
create function public.check_vin_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  car_vin text := to_jsonb(new) ->> tg_argv[0];
begin
  if car_vin is not null
     and exists (select 1 from public.vehicles v where v.vin = car_vin and v.user_id <> new.user_id)
     and not exists (select 1 from public.vehicles v where v.vin = car_vin and v.user_id = new.user_id) then
    raise exception using
      errcode = '23503',
      message = format('%s.%s is another user''s car', tg_table_name, tg_argv[0]);
  end if;
  return new;
end;
$$;

revoke all on function public.check_vin_user() from public, anon, authenticated;

create trigger charging_sessions_vin_user
  before insert or update of vehicle_vin, user_id on public.charging_sessions
  for each row execute function public.check_vin_user('vehicle_vin');

create trigger stream_charge_sessions_vin_user
  before insert or update of vin, user_id on public.stream_charge_sessions
  for each row execute function public.check_vin_user('vin');

-- 8. User-aware versions of the per-car functions, for step 3. The old signatures stay for the code
-- that's deployed; step 4 drops them.

-- As counter_values_at(text, text[], timestamptz[]), for one user's copy of a car.
create function public.counter_values_at(p_user_id bigint, p_vin text, p_fields text[], p_at timestamptz[])
returns table (field text, at timestamptz, value jsonb, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select f.field, b.at, r.value, r.created_at
  from unnest(p_fields) as f (field)
  cross join unnest(p_at) as b (at)
  left join lateral (
    select t.value, t.created_at
    from public.telemetry_readings t
    where t.vin = p_vin and t.field = f.field and t.created_at < b.at and t.user_id = p_user_id
    order by t.created_at desc
    limit 1
  ) r on true
  union all
  select f.field, null, r.value, r.created_at
  from unnest(p_fields) as f (field)
  left join lateral (
    select t.value, t.created_at
    from public.telemetry_readings t
    where t.vin = p_vin and t.field = f.field and t.user_id = p_user_id
    order by t.created_at asc
    limit 1
  ) r on true
$$;

revoke all on function public.counter_values_at(bigint, text, text[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.counter_values_at(bigint, text, text[], timestamptz[]) to service_role;

-- As snapshot_odometer_at(timestamptz[]), which reads every car's snapshots, for one user's only.
create function public.snapshot_odometer_at(p_user_id bigint, p_at timestamptz[])
returns table (at timestamptz, odometer text, polled_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select b.at, s.odometer, s.polled_at
  from unnest(p_at) as b (at)
  left join lateral (
    select x.raw -> 'vehicle_state' ->> 'odometer' as odometer, x.polled_at
    from public.snapshots x
    where x.user_id = p_user_id and x.state = 'online' and x.raw -> 'vehicle_state' ->> 'odometer' is not null and x.polled_at < b.at
    order by x.polled_at desc
    limit 1
  ) s on true
  union all
  select null, s.odometer, s.polled_at
  from (
    select x.raw -> 'vehicle_state' ->> 'odometer' as odometer, x.polled_at
    from public.snapshots x
    where x.user_id = p_user_id and x.state = 'online' and x.raw -> 'vehicle_state' ->> 'odometer' is not null
    order by x.polled_at asc
    limit 1
  ) s
$$;

revoke all on function public.snapshot_odometer_at(bigint, timestamptz[]) from public, anon, authenticated;
grant execute on function public.snapshot_odometer_at(bigint, timestamptz[]) to service_role;

-- Rollback (manual, not run). Safe while the old code is the one deployed; it ignores everything here.
--   drop function if exists public.snapshot_odometer_at(bigint, timestamptz[]);
--   drop function if exists public.counter_values_at(bigint, text, text[], timestamptz[]);
--   drop trigger if exists stream_charge_sessions_vin_user on public.stream_charge_sessions;
--   drop trigger if exists charging_sessions_vin_user on public.charging_sessions;
--   drop function if exists public.check_vin_user();
--   alter table public.charge_receipts drop constraint if exists charge_receipts_user_session_fkey;
--   alter table public.version_history drop constraint if exists version_history_user_vehicle_fkey;
--   alter table public.snapshots drop constraint if exists snapshots_user_vehicle_fkey;
--   (for each of vehicles, snapshots, version_history, charging_sessions, stream_charge_sessions,
--    charge_receipts, connector_token, poll_runs, telemetry_readings:)
--     alter table public.<table> drop column if exists user_id;   -- drops its indexes and keys with it
--   drop trigger if exists oauth_tokens_legacy_owner_user on public.oauth_tokens;
--   drop function if exists public.legacy_owner_user();
--   drop function if exists public.legacy_owner_id();
--   drop table if exists public.user_tokens;
--   drop table if exists public.users;
