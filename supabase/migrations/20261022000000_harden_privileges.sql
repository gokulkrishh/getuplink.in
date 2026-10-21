-- Harden database privileges.
-- The app talks to Postgres only through the server-side service-role key. RLS is on with no
-- policies on every public table, but anon/authenticated still held full table grants, so a
-- single future policy (or RLS being switched off) would expose the data. Remove the grants.
-- service_role grants are deliberately left alone.

-- 1. Public API roles get nothing on what exists today...
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ...and nothing on what gets created later (applies to objects created by the migrating role).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 2. public.rls_auto_enable() is a Supabase-installed SECURITY DEFINER event-trigger helper
-- (not created by our migrations). It should not be callable through the API. Guarded so the
-- migration still runs where the function does not exist (e.g. a plain local Postgres).
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- 3. "Latest poll run" lookups order by started_at desc.
create index if not exists poll_runs_started_idx on public.poll_runs (started_at desc);

-- 4. Single-owner invariant: oauth_tokens only ever holds the 'tesla' row.
-- Added NOT VALID (no long scan/lock), then validated; existing rows already satisfy it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_tokens'::regclass
      and conname = 'oauth_tokens_provider_tesla_check'
  ) then
    alter table public.oauth_tokens
      add constraint oauth_tokens_provider_tesla_check check (provider = 'tesla') not valid;
    alter table public.oauth_tokens validate constraint oauth_tokens_provider_tesla_check;
  end if;
end
$$;

-- Rollback (manual, not run):
--   alter table public.oauth_tokens drop constraint if exists oauth_tokens_provider_tesla_check;
--   drop index if exists public.poll_runs_started_idx;
--   grant execute on function public.rls_auto_enable() to public, anon, authenticated;  -- only if it exists
--   grant all on all tables in schema public to anon, authenticated;  -- only to restore old (unsafe) state
--   (likewise sequences/functions, and alter default privileges ... grant all ... to anon, authenticated)
