-- What each failed check found ("No streamed data for 3 h while the car was online"), so the status page can
-- list past issues with their reason, not only a coloured bar. Empty for a working check.
--
-- Additive: old rows read as no reason given.

alter table public.health_checks add column if not exists problems text[] not null default '{}';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.health_checks drop column problems;
