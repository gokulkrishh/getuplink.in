-- Step 4 of docs/signup-plan.md, part 2 of 3 (contract): the single-owner keys go, so a second user's copy
-- of a car another user tracks is accepted.
--
-- APPLY ALONE, only once the step 4 app code is deployed and working (it upserts on the per-user keys
-- 20261102120000_shared_cars.sql added). Under the step 3 code this breaks its writes: its upserts name
-- conflict targets (charging_sessions session_id, stream_charge_sessions vin,started_at) whose unique
-- index this drops, and Postgres refuses those with 42P10. So no app rollback past step 4 after this.
--
-- Every table here is small (one row per car, charge or invoice), so each swap is quick. The receiver's
-- table, telemetry_readings, isn't touched: its readings are stored once per VIN and its (vin, field,
-- created_at) key stays (see the shared_cars migration).
--
-- Rollback (manual, not run) is at the end.

set lock_timeout = '5s';

-- 1. Cars: one row per user per car. A snapshot or version change already names its car by (user_id,
-- vehicle_id) (the users migration's composite foreign keys); the vehicle_id-only ones go first.
alter table public.snapshots drop constraint snapshots_vehicle_id_fkey;
alter table public.version_history drop constraint version_history_vehicle_id_fkey;
alter table public.vehicles drop constraint vehicles_pkey;
-- The (user_id, id) unique index the composite foreign keys point at becomes the primary key.
alter table public.vehicles add constraint vehicles_pkey primary key using index vehicles_user_id_key;
-- vin stays unique per user (vehicles_user_vin_key); vehicles_vin_idx serves lookups by VIN.
alter table public.vehicles drop constraint vehicles_vin_key;

-- Per user now (version_history_user_*_key, from the shared_cars migration).
drop index public.version_history_vehicle_detected_key;
drop index if exists public.version_history_imported_version_key;

-- 2. Supercharger sessions: Tesla's session id, per user.
alter table public.charging_sessions drop constraint charging_sessions_pkey;
alter table public.charging_sessions add constraint charging_sessions_pkey primary key using index charging_sessions_user_session_key;

-- 3. Streamed charging sessions: one per user per car per start. The (vin, started_at desc) index stays:
-- prune_telemetry_readings' near-charge check looks sessions up by VIN, any user's.
alter table public.stream_charge_sessions drop constraint stream_charge_sessions_vin_started_at_key;
-- Covered by the unique (user_id, vin, started_at) index.
drop index public.stream_charge_sessions_user_vin_started_idx;

-- 4. Invoices. session_id stays the primary key (stream_charge_sessions.id is an identity, unique across
-- users); the restrict foreign key on it alone goes, and the (user_id, session_id) one stays: it is checked
-- at the end of a statement, so deleting a user (which cascades to sessions and invoices) passes.
alter table public.charge_receipts drop constraint charge_receipts_session_id_fkey;
alter table public.charge_receipts drop constraint charge_receipts_source_ref_key;
drop index public.charge_receipts_network_number_idx;

-- 5. The connector token: one per user, keyed by user. The single-row `owner = 'tesla'` key goes with its
-- column (nothing reads or writes it).
alter table public.connector_token drop constraint connector_token_pkey;
alter table public.connector_token add constraint connector_token_pkey primary key using index connector_token_user_key;
alter table public.connector_token drop column owner;

notify pgrst, 'reload schema';

-- Rollback (manual, not run). Only possible while no user shares a car, a session id or an invoice with
-- another user, and only with the step 3 code redeployed after it.
--   alter table public.connector_token add column owner text not null default 'tesla' check (owner = 'tesla');
--   alter table public.connector_token drop constraint connector_token_pkey;
--   create unique index connector_token_user_key on public.connector_token (user_id);
--   alter table public.connector_token add primary key (owner);
--   create unique index charge_receipts_network_number_idx on public.charge_receipts (lower(network), invoice_number) where invoice_number is not null;
--   alter table public.charge_receipts add constraint charge_receipts_source_ref_key unique (source_ref);
--   alter table public.charge_receipts add constraint charge_receipts_session_id_fkey foreign key (session_id)
--     references public.stream_charge_sessions (id) on delete restrict;
--   create index stream_charge_sessions_user_vin_started_idx on public.stream_charge_sessions (user_id, vin, started_at desc);
--   alter table public.stream_charge_sessions add constraint stream_charge_sessions_vin_started_at_key unique (vin, started_at);
--   alter table public.charging_sessions drop constraint charging_sessions_pkey;
--   create unique index charging_sessions_user_session_key on public.charging_sessions (user_id, session_id);
--   alter table public.charging_sessions add primary key (session_id);
--   create unique index version_history_imported_version_key on public.version_history (vehicle_id, version) where source = 'imported';
--   create unique index version_history_vehicle_detected_key on public.version_history (vehicle_id, detected_at);
--   alter table public.vehicles add constraint vehicles_vin_key unique (vin);
--   (vehicles_pkey back to (id): drop the composite foreign keys, drop vehicles_pkey, re-create
--    vehicles_user_id_key and the composite keys, add primary key (id), then the vehicle_id foreign keys)
