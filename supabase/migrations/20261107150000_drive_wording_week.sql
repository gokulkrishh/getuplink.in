-- Home's AI line on the last 7 days (lib/week-wording.ts) is kept in drive_wording too, as scope 'week':
-- one row per owner, car and IST day (drive_start is that day's start), written at most once a day.
--
-- Widens the scope check only; no row changes.

alter table public.drive_wording drop constraint drive_wording_scope_check;
alter table public.drive_wording add constraint drive_wording_scope_check check (scope in ('trip', 'drive', 'week'));

notify pgrst, 'reload schema';

-- Rollback (manual, not run): delete the week rows, then put back check (scope in ('trip', 'drive')).
