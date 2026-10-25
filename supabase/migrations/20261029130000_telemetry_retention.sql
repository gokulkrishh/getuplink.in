-- Retention for telemetry_readings. The rules (how many days each field is kept, or forever) live in
-- lib/telemetry-retention.ts next to the table of where each field is read; app/api/cron/retention passes
-- them in once a day. This function only applies them, so the two can't drift apart.
--
-- One call deletes at most p_limit rows and returns how many it deleted. A function runs in one
-- transaction, so the caller loops, one call per batch, until a call deletes fewer than p_limit: each
-- transaction stays short, and the receiver's inserts (new rows only) never wait on it.
--
-- Always kept, whatever the rules say:
--   * each (vin, field)'s newest row, since pages read "the latest value", which can be months old;
--   * rows of p_near_charge_fields (Location) within p_near_charge_minutes of a charge session's start,
--     which the charging map reads for sessions of any age.
--
-- Deletes run per (vin, field), found by walking the (vin, field, created_at) unique index, so each is a
-- range scan on that index and no new index is needed on this insert-heavy table.

create function public.prune_telemetry_readings(
  p_fields text[],
  p_keep_days integer[],               -- per p_fields entry; null keeps that field forever
  p_default_days integer,              -- every field not in p_fields
  p_near_charge_fields text[],
  p_near_charge_minutes integer,
  p_limit integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  pair record;
  pos integer;
  keep integer;
  newest timestamptz;
  cutoff timestamptz;
  near interval := make_interval(mins => coalesce(p_near_charge_minutes, 0));
  remaining integer := p_limit;
  deleted integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be at least 1';
  end if;
  if p_default_days is null or p_default_days < 1 then
    raise exception 'p_default_days must be at least 1';
  end if;
  if coalesce(cardinality(p_fields), 0) <> coalesce(cardinality(p_keep_days), 0) then
    raise exception 'p_fields and p_keep_days must be the same length';
  end if;
  if exists (select 1 from unnest(p_keep_days) as k (days) where k.days < 1) then
    raise exception 'p_keep_days must be at least 1 (or null for forever)';
  end if;

  for pair in
    with recursive pairs (vin, field) as (
      (select t.vin, t.field from public.telemetry_readings t order by t.vin, t.field limit 1)
      union all
      select n.vin, n.field
      from pairs p
      cross join lateral (
        select t.vin, t.field
        from public.telemetry_readings t
        where (t.vin, t.field) > (p.vin, p.field)
        order by t.vin, t.field
        limit 1
      ) n
    )
    select pairs.vin, pairs.field from pairs
  loop
    pos := array_position(p_fields, pair.field);
    if pos is null then
      keep := p_default_days;
    else
      keep := p_keep_days[pos];
    end if;
    continue when keep is null;

    select max(t.created_at) into newest
    from public.telemetry_readings t
    where t.vin = pair.vin and t.field = pair.field;
    cutoff := least(now() - make_interval(days => keep), newest);

    delete from public.telemetry_readings t
    where t.id in (
      select x.id
      from public.telemetry_readings x
      where x.vin = pair.vin
        and x.field = pair.field
        and x.created_at < cutoff
        and not (
          x.field = any (coalesce(p_near_charge_fields, '{}'))
          and exists (
            select 1
            from public.stream_charge_sessions s
            where s.vin = x.vin
              and s.started_at > x.created_at - near
              and s.started_at < x.created_at + near
          )
        )
      order by x.created_at
      limit remaining
    );
    get diagnostics deleted = row_count;
    remaining := remaining - deleted;
    exit when remaining <= 0;
  end loop;

  return p_limit - remaining;
end;
$$;

revoke all on function public.prune_telemetry_readings(text[], integer[], integer, text[], integer, integer) from public, anon, authenticated;
grant execute on function public.prune_telemetry_readings(text[], integer[], integer, text[], integer, integer) to service_role;

comment on table public.telemetry_readings is
  'Raw Fleet Telemetry signals. Pruned daily by prune_telemetry_readings; rules in lib/telemetry-retention.ts.';

-- Rollback (manual, not run):
--   drop function if exists public.prune_telemetry_readings(text[], integer[], integer, text[], integer, integer);
