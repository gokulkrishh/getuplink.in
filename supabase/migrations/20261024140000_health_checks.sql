-- One row per component per health check, for the public status page (app/status/page.tsx).
-- Rows hold only a component name and a status: no VINs, readings or error text.
-- recordHealth() (lib/server/stream-health.ts) deletes rows older than 120 days when it inserts.

create table public.health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  component text not null,
  status text not null check (status in ('operational', 'degraded', 'down'))
);

create index health_checks_component_checked_idx
  on public.health_checks (component, checked_at desc);

alter table public.health_checks enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.health_checks from anon, authenticated;
revoke all on sequence public.health_checks_id_seq from anon, authenticated;

-- One row per component per IST day: the worst status that day and how many checks were up
-- (operational or degraded) out of the total. Keeps the status page from pulling ~100k rows.
create function public.health_daily(since timestamptz)
returns table (component text, day date, status text, up bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  select
    h.component,
    (h.checked_at at time zone 'Asia/Kolkata')::date as day,
    case max(case h.status when 'down' then 2 when 'degraded' then 1 else 0 end)
      when 2 then 'down' when 1 then 'degraded' else 'operational'
    end as status,
    count(*) filter (where h.status <> 'down') as up,
    count(*) as total
  from public.health_checks h
  where h.checked_at >= since
  group by 1, 2
$$;

revoke all on function public.health_daily(timestamptz) from public, anon, authenticated;
grant execute on function public.health_daily(timestamptz) to service_role;
