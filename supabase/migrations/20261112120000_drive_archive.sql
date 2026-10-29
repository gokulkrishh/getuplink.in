-- Drives kept for good. Streamed readings of a drive (speed, location, power ...) are deleted after
-- DRIVE_DAYS (lib/telemetry-retention.ts), and drives are rebuilt from them, so a trip used to vanish
-- 90 days after it was driven. Each night, before that, lib/server/drive-archive.ts stores every finished
-- drive here: what the trip list shows (`drive`, a Drive from lib/drives.ts) and a slimmed copy of the
-- readings its trip page draws (`readings`, see lib/drive-archive.ts), about 1/30th of the rows.
--
-- One row per car (VIN) and drive, like telemetry_readings: whoever tracks the car, it is stored once and
-- read through each user's window (user_drive_archive below). Deleted with the readings when nobody may
-- see it any more (forget_unseen_drive_archive below).
--
-- Deploy this before the code. Until then the code archives nothing and reads no archive.

create table public.drive_archive (
  vin text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- The span the slimmed readings cover: the drive with a little either side.
  readings_from timestamptz not null,
  readings_to timestamptz not null,
  drive jsonb not null,
  -- { field: [[created_at, value], ...] }, each the car's own reading, oldest first.
  readings jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (vin, start_at)
);

comment on table public.drive_archive is
  'Finished drives kept past the readings'' retention: the Drive and slimmed readings (lib/drive-archive.ts).';

alter table public.drive_archive enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.drive_archive from anon, authenticated;

-- Archived drives each user may see: their cars' drives that started within the user's window, as
-- user_telemetry_readings does for readings.
create view public.user_drive_archive with (security_invoker = true) as
select v.user_id, a.vin, a.start_at, a.end_at, a.readings_from, a.readings_to, a.drive, a.readings
from public.drive_archive a
join public.vehicles v on v.vin = a.vin
where a.start_at >= v.readings_from
  and (v.readings_until is null or a.start_at < v.readings_until);

revoke all on table public.user_drive_archive from anon, authenticated;
grant select on table public.user_drive_archive to service_role;

-- Archived drives nobody may see any more, of one car or (p_vin null) every car: those of a car nobody
-- tracks, or that started outside every user's window. Called with the readings' own clean-up (Delete my
-- data, and the daily retention sweep). Returns how many went. The table is small (a row per drive).
create function public.forget_unseen_drive_archive(p_vin text)
returns integer
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.drive_archive a
    where (p_vin is null or a.vin = p_vin)
      and not exists (
        select 1 from public.vehicles v
        where v.vin = a.vin
          and a.start_at >= v.readings_from
          and (v.readings_until is null or a.start_at < v.readings_until)
      )
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.forget_unseen_drive_archive(text) from public, anon, authenticated;
grant execute on function public.forget_unseen_drive_archive(text) to service_role;

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   drop function if exists public.forget_unseen_drive_archive(text);
--   drop view if exists public.user_drive_archive;
--   drop table if exists public.drive_archive;
