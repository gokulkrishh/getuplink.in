-- Step 4 of docs/signup-plan.md, part 3 of 3 (cleanup): the single-owner leftovers go.
--
-- APPLY ALONE, last: after 20261102130000_per_user_keys.sql, once the step 4 app code is deployed (it no
-- longer reads oauth_tokens, users.email, telemetry_readings.user_id or the old function signatures). It
-- refuses to run while oauth_tokens still holds a token pair: that means step 3's cutover hasn't moved the
-- owner's tokens to user_tokens yet, and dropping the table would lose them.
--
-- No rollback: oauth_tokens' row and users.email hold nothing by now (checked below), and the defaults
-- named a user the code no longer needs.

set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.oauth_tokens') is not null
     and exists (select 1 from public.oauth_tokens where access_token_enc is not null or refresh_token_enc is not null) then
    raise exception 'oauth_tokens still holds a token pair: run the step 3 cutover (any check of the owner) first';
  end if;
  if exists (select 1 from public.users where email is not null) then
    raise exception 'users.email holds a value: Uplink keeps no email, so look before dropping it';
  end if;
end
$$;

-- 1. Every user_id is set by the code now. The receiver's rows have no user (readings are per VIN), so the
-- column goes from telemetry_readings: dropping a column is metadata only, no rewrite of the large table.
alter table public.vehicles               alter column user_id drop default;
alter table public.snapshots              alter column user_id drop default;
alter table public.version_history        alter column user_id drop default;
alter table public.charging_sessions      alter column user_id drop default;
alter table public.stream_charge_sessions alter column user_id drop default;
alter table public.charge_receipts        alter column user_id drop default;
alter table public.connector_token        alter column user_id drop default;
alter table public.poll_runs              alter column user_id drop default;
alter table public.telemetry_readings     drop column user_id;

-- 2. The single-owner token row, the trigger that made its owner a user, and the default's function.
drop trigger if exists oauth_tokens_legacy_owner_user on public.oauth_tokens;
drop function if exists public.legacy_owner_user();
drop table if exists public.oauth_tokens;
drop function if exists public.legacy_owner_id();

-- 3. The single-owner function signatures (the step 3 code already calls the p_user_id ones).
drop function if exists public.counter_values_at(text, text[], timestamptz[]);
drop function if exists public.snapshot_odometer_at(timestamptz[]);

-- 4. No email anywhere (step 6).
drop index if exists public.users_email_key;
alter table public.users drop column if exists email;

-- 5. owner_settings: a single-row ('tesla') table from an earlier plan that no code reads; absent in
-- production, so this only tidies a database made from every migration.
drop table if exists public.owner_settings;

notify pgrst, 'reload schema';
