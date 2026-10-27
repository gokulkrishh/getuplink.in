-- The AI tips on a drive's page, Stats > Charging and one charge's page (lib/ai-tips.ts) are kept in
-- drive_wording too, beside Home's 'week':
--   'drive_tips' / 'trip_tips': one drive or one trip (a trip and its first leg start together), keyed by its start;
--   'charging': Stats > Charging, one row per owner, car and IST day (drive_start is that day's start);
--   'charge': one charge's page, keyed by the charge's start;
--   'battery': Stats > Battery, one row per owner, car and IST day.
--
-- Widens the scope check only; no row changes. Additive: before it runs, the app claims a row first
-- (lib/server/ai-tips.ts), the claim fails the check, and no model is called. Apply it any time.

alter table public.drive_wording drop constraint drive_wording_scope_check;
alter table public.drive_wording add constraint drive_wording_scope_check
  check (scope in ('trip', 'drive', 'week', 'drive_tips', 'trip_tips', 'charging', 'charge', 'battery'));

notify pgrst, 'reload schema';

-- Rollback (manual, not run): delete the rows with the new scopes, then put back
--   check (scope in ('trip', 'drive', 'week')).
