-- 1. One check at a time.
-- The cron and "Check now" must never overlap: they would spend the same single-use Tesla
-- refresh token and could record a version change twice. A partial unique index allows at most
-- one unfinished poll_runs row. (Advisory locks don't fit: supabase-js goes through PostgREST,
-- where each request may use a different pooled connection.)
update public.poll_runs
set finished_at = now(), ok = false, error = coalesce(error, 'Did not finish')
where finished_at is null;

create unique index poll_runs_one_running_idx on public.poll_runs ((true)) where finished_at is null;

-- 2. Richer version history.
alter table public.version_history
  add column available_at timestamptz, -- first check that saw this version offered as an update
  add column odometer_km numeric(10, 1); -- odometer when the new version was first seen
