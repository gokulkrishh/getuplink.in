-- Step 4 of docs/signup-plan.md, part 1 of 3 (expand): two users can track the same car.
--
-- APPLY ALONE, before deploying the step 4 app code, and before 20261102130000_per_user_keys.sql.
-- Additive and safe under the deployed step 3/5/6 code: it adds a column, a view, indexes and functions,
-- and replaces one function body whose answers for the existing owner don't change (see 3).
--
-- The design: streamed readings stay stored once per VIN, as the Fly receiver writes them today (no
-- receiver change). A user reads a car's readings only through their own car row, the per-user car link:
-- vehicles (user_id, vin), which now carries the window of time that user may see, readings_from up to
-- readings_until. A second user who adds a car sees what it streamed from then on, never the time before,
-- and a seller whose car has been gone from their Tesla account for a week stops seeing it from when it
-- went. Readings nobody's window
-- covers are deleted (Delete my data, and the daily retention run), so a car's readings stay while anyone
-- still tracks it and go when nobody does.
--
-- Why not a copy per user: Tesla streams a car once per app however many users track it, so a copy per
-- user doubles writes and storage for a shared car, makes the receiver look users up per VIN (and file
-- rows wrongly when that lookup is stale), and double counts streamed signals for the budget. One copy
-- with a per-user window keeps the receiver, the (vin, field, created_at) key and the signal count as they
-- are, and needs no new index on the large table.
--
-- Rollback (manual, not run) is at the end.

set lock_timeout = '5s';

-- 1. The per-user window on each car link. Existing rows (the owner's cars) see everything, as today: a
-- constant default is metadata only, kept as the value of every existing row. New links start now.
alter table public.vehicles add column readings_from timestamptz not null default '-infinity';
alter table public.vehicles alter column readings_from set default now();
-- Set by the check once the car has been gone from this user's Tesla account for a while (lib/server/poll.ts
-- syncWindows); null while it is theirs. missing_since is the first check that didn't list it: one list
-- that leaves a car out (a Tesla hiccup) must not close the window, since reopening it starts from then and
-- the time before would be lost to that user.
alter table public.vehicles add column readings_until timestamptz;
alter table public.vehicles add column missing_since timestamptz;
alter table public.vehicles
  add constraint vehicles_readings_window_check check (readings_until is null or readings_until >= readings_from);

comment on column public.vehicles.readings_from is 'This user sees the car''s streamed readings from this time (when they began tracking it).';
comment on column public.vehicles.readings_until is 'Until this time, when the car left this user''s Tesla account. Null: still theirs.';
comment on column public.vehicles.missing_since is 'The first check whose Tesla vehicle list left this car out, while it still does. Null: listed.';

-- Car links by VIN: the view's join, who else tracks a car (Delete my data, Disconnect), the prune.
create index vehicles_vin_idx on public.vehicles (vin) where vin is not null;

-- 2. What each user may read: a VIN's readings inside that user's window for the car. The app reads
-- streamed readings only through this view, filtered to the signed-in user (lib/server/data/owner.ts).
-- security_invoker: it runs with the caller's rights (service role only), never the view owner's.
create view public.user_telemetry_readings with (security_invoker = true) as
select v.user_id, t.id, t.vin, t.field, t.created_at, t.received_at, t.value
from public.telemetry_readings t
join public.vehicles v on v.vin = t.vin
where t.created_at >= v.readings_from
  and (v.readings_until is null or t.created_at < v.readings_until);

comment on view public.user_telemetry_readings is
  'Streamed readings each user may see: their cars'' readings within vehicles.readings_from .. readings_until.';

revoke all on table public.user_telemetry_readings from anon, authenticated;
grant select on table public.user_telemetry_readings to service_role;

-- 3. The per-user counter lookup reads through the same window. The step 3 code calls this signature
-- already; for the owner (window -infinity .. open) every answer is what it was. A VIN the user has no car
-- row for returns no rows.
create or replace function public.counter_values_at(p_user_id bigint, p_vin text, p_fields text[], p_at timestamptz[])
returns table (field text, at timestamptz, value jsonb, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with link as (
    select v.readings_from as from_at, coalesce(v.readings_until, 'infinity') as until_at
    from public.vehicles v
    where v.user_id = p_user_id and v.vin = p_vin
  )
  select f.field, b.at, r.value, r.created_at
  from link
  cross join unnest(p_fields) as f (field)
  cross join unnest(p_at) as b (at)
  left join lateral (
    select t.value, t.created_at
    from public.telemetry_readings t
    where t.vin = p_vin and t.field = f.field
      and t.created_at < least(b.at, link.until_at) and t.created_at >= link.from_at
    order by t.created_at desc
    limit 1
  ) r on true
  union all
  select f.field, null, r.value, r.created_at
  from link
  cross join unnest(p_fields) as f (field)
  left join lateral (
    select t.value, t.created_at
    from public.telemetry_readings t
    where t.vin = p_vin and t.field = f.field
      and t.created_at >= link.from_at and t.created_at < link.until_at
    order by t.created_at asc
    limit 1
  ) r on true
$$;

-- 4. Deleting readings nobody may see any more. One call deletes at most p_limit rows of one VIN and
-- returns how many; the caller loops until a call deletes fewer, so each transaction stays short and the
-- receiver's inserts never wait on it. Three cases, cheapest first:
--   * no car row names the VIN: all its rows go (a range scan on the index's vin prefix);
--   * every link is open: only rows older than the earliest readings_from go, per (vin, field), each a
--     range scan on the (vin, field, created_at) index, so a car tracked from the start costs nothing and
--     a second user's car costs one index probe per field;
--   * a link is closed (the car left someone's account): rows outside every window, checked row by row.
-- Each batch is deleted by id = any(array(...)), primary key lookups: with "id in (subquery)" the planner
-- prefers a hash join over a scan of the whole table.
create function public.forget_unseen_readings(p_vin text, p_limit integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  links integer;
  closed boolean;
  earliest timestamptz;
  pair record;
  remaining integer := p_limit;
  deleted integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be at least 1';
  end if;
  select count(*), bool_or(v.readings_until is not null), min(v.readings_from)
  into links, closed, earliest
  from public.vehicles v
  where v.vin = p_vin;

  if links = 0 then
    delete from public.telemetry_readings t
    where t.id = any (array(select x.id from public.telemetry_readings x where x.vin = p_vin limit p_limit));
    get diagnostics deleted = row_count;
    return deleted;
  end if;

  if not closed then
    if earliest = '-infinity' then
      return 0;
    end if;
    for pair in
      with recursive fields (field) as (
        (select t.field from public.telemetry_readings t where t.vin = p_vin order by t.field limit 1)
        union all
        select (select t.field from public.telemetry_readings t where t.vin = p_vin and t.field > f.field order by t.field limit 1)
        from fields f
        where f.field is not null
      )
      select fields.field from fields where fields.field is not null
    loop
      delete from public.telemetry_readings t
      where t.id = any (array(
        select x.id from public.telemetry_readings x
        where x.vin = p_vin and x.field = pair.field and x.created_at < earliest
        order by x.created_at
        limit remaining
      ));
      get diagnostics deleted = row_count;
      remaining := remaining - deleted;
      exit when remaining <= 0;
    end loop;
    return p_limit - remaining;
  end if;

  delete from public.telemetry_readings t
  where t.id = any (array(
    select x.id
    from public.telemetry_readings x
    where x.vin = p_vin
      and not exists (
        select 1 from public.vehicles v
        where v.vin = x.vin
          and x.created_at >= v.readings_from
          and (v.readings_until is null or x.created_at < v.readings_until)
      )
    limit p_limit
  ));
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.forget_unseen_readings(text, integer) from public, anon, authenticated;
grant execute on function public.forget_unseen_readings(text, integer) to service_role;

-- The daily retention run's sweep over every VIN (lib/server/retention.ts), for what Delete my data
-- couldn't finish and for a car still streaming after its last user left. VINs are found by walking the
-- (vin, field, created_at) unique index, as prune_telemetry_readings does.
create function public.prune_unseen_readings(p_limit integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  car record;
  remaining integer := p_limit;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be at least 1';
  end if;
  for car in
    with recursive vins (vin) as (
      (select t.vin from public.telemetry_readings t order by t.vin limit 1)
      union all
      select (select t.vin from public.telemetry_readings t where t.vin > v.vin order by t.vin limit 1)
      from vins v
      where v.vin is not null
    )
    select vins.vin from vins where vins.vin is not null
  loop
    remaining := remaining - public.forget_unseen_readings(car.vin, remaining);
    exit when remaining <= 0;
  end loop;
  return p_limit - remaining;
end;
$$;

revoke all on function public.prune_unseen_readings(integer) from public, anon, authenticated;
grant execute on function public.prune_unseen_readings(integer) to service_role;

-- 5. Per-user keys beside the single-owner ones, which 20261102130000_per_user_keys.sql drops once the
-- step 4 code (which upserts on these) is deployed. The old ones stay for now: the deployed code upserts
-- on them, and Postgres needs a unique index that matches a conflict target exactly. Small tables.
create unique index charging_sessions_user_session_key on public.charging_sessions (user_id, session_id);
create unique index stream_charge_sessions_user_vin_started_key on public.stream_charge_sessions (user_id, vin, started_at);
-- Both users of a shared car record the same streamed version change at the same time.
create unique index version_history_user_vehicle_detected_key on public.version_history (user_id, vehicle_id, detected_at);
create unique index version_history_user_imported_version_key on public.version_history (user_id, vehicle_id, version)
  where source = 'imported';
-- Two users of a shared car may attach the same invoice, each to their own session.
create unique index charge_receipts_user_source_ref_key on public.charge_receipts (user_id, source_ref);
create unique index charge_receipts_user_network_number_key on public.charge_receipts (user_id, lower(network), invoice_number)
  where invoice_number is not null;

notify pgrst, 'reload schema';

-- Rollback (manual, not run). Safe while the step 3/5/6 code is deployed; it uses none of this.
--   drop index if exists public.charge_receipts_user_network_number_key;
--   drop index if exists public.charge_receipts_user_source_ref_key;
--   drop index if exists public.version_history_user_imported_version_key;
--   drop index if exists public.version_history_user_vehicle_detected_key;
--   drop index if exists public.stream_charge_sessions_user_vin_started_key;
--   drop index if exists public.charging_sessions_user_session_key;
--   drop function if exists public.prune_unseen_readings(integer);
--   drop function if exists public.forget_unseen_readings(text, integer);
--   (counter_values_at(bigint, ...): re-create it from 20261030120000_users.sql, filtering on t.user_id)
--   drop view if exists public.user_telemetry_readings;
--   drop index if exists public.vehicles_vin_idx;
--   alter table public.vehicles drop constraint if exists vehicles_readings_window_check;
--   alter table public.vehicles drop column if exists missing_since, drop column if exists readings_until,
--     drop column if exists readings_from;
