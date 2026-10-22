-- Home state for the India rollout map: the state or union territory a car is in most often, worked out
-- from its location at each 6-hourly check. Only two-letter state codes are stored, never coordinates:
-- the poll turns latitude and longitude into a code in memory and drops them.

alter table public.vehicles
  -- The most common code in recent_states. Null until the first located check.
  add column home_state text check (home_state is null or home_state ~ '^[A-Z]{2}$'),
  -- The last 30 located checks' state codes, oldest first, so one road trip doesn't move the car.
  add column recent_states text[] not null default '{}'
    check (cardinality(recent_states) <= 30);

-- Rollback (manual, not run):
--   alter table public.vehicles drop column if exists recent_states, drop column if exists home_state;
