-- Monthly counters for the Stats page in one request each, instead of one PostgREST query per
-- field per month boundary (~56 per page view). Both functions return, per boundary, the last
-- reading strictly before it (same as the old .lt() queries), plus one row with a null `at`
-- holding the first reading ever. Pass 'infinity' as a boundary to get the latest reading.

-- Lifetime counters (and Odometer) from Fleet Telemetry. Each LATERAL is one backward step on the
-- (vin, field, created_at) unique index.
create function public.counter_values_at(p_vin text, p_fields text[], p_at timestamptz[])
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
    where t.vin = p_vin and t.field = f.field and t.created_at < b.at
    order by t.created_at desc
    limit 1
  ) r on true
  union all
  select f.field, null, r.value, r.created_at
  from unnest(p_fields) as f (field)
  left join lateral (
    select t.value, t.created_at
    from public.telemetry_readings t
    where t.vin = p_vin and t.field = f.field
    order by t.created_at asc
    limit 1
  ) r on true
$$;

revoke all on function public.counter_values_at(text, text[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.counter_values_at(text, text[], timestamptz[]) to service_role;

-- Odometer (miles, as text) from online polls, for months before streaming began. Like the old
-- queries it reads every car's snapshots (there is one car).
create function public.snapshot_odometer_at(p_at timestamptz[])
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
    where x.state = 'online' and x.raw -> 'vehicle_state' ->> 'odometer' is not null and x.polled_at < b.at
    order by x.polled_at desc
    limit 1
  ) s on true
  union all
  select null, s.odometer, s.polled_at
  from (
    select x.raw -> 'vehicle_state' ->> 'odometer' as odometer, x.polled_at
    from public.snapshots x
    where x.state = 'online' and x.raw -> 'vehicle_state' ->> 'odometer' is not null
    order by x.polled_at asc
    limit 1
  ) s
$$;

revoke all on function public.snapshot_odometer_at(timestamptz[]) from public, anon, authenticated;
grant execute on function public.snapshot_odometer_at(timestamptz[]) to service_role;

-- The only snapshots index leads with vehicle_id, which these lookups don't filter on. This lets each
-- boundary walk back from its instant instead of scanning the table.
create index if not exists snapshots_online_polled_idx
  on public.snapshots (polled_at desc)
  where state = 'online';

-- Rollback (manual, not run):
--   drop index if exists public.snapshots_online_polled_idx;
--   drop function if exists public.snapshot_odometer_at(timestamptz[]);
--   drop function if exists public.counter_values_at(text, text[], timestamptz[]);
