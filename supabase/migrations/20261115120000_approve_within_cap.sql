-- The places cap (MAX_USERS) checked and taken in one transaction. Until now an approval counted the
-- approved users, then approved: two approvals at once with one place left (two invite links redeemed
-- together, or the admin approving while an invite is redeemed) both saw a free place and both got in.
--
-- The cap lives in the app's env, so a constraint can't hold it. This function takes a transaction-scoped
-- advisory lock, so approvals through it run one at a time; each counts and approves under the lock.
--
-- Additive: one new function. The code calls it and, while it's missing (PGRST202), keeps the old count
-- then approve (lib/server/data/system.ts approveWithinCap). Apply it before or after deploying.

create or replace function public.approve_within_cap(
  p_max integer,
  p_user_id bigint default null,
  p_sub text default null,
  p_from text[] default array['waitlist']
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  approved_id bigint;
begin
  -- One lock for every approval, held until this transaction ends.
  perform pg_advisory_xact_lock(hashtext('public.approve_within_cap'));

  if (select count(*) from public.users where status = 'approved') >= p_max then
    return 'full';
  end if;

  if p_user_id is not null then
    -- An existing account, from one of the p_from states, never an admin's (as moveAccount does).
    update public.users
    set status = 'approved', approved_at = now(), updated_at = now()
    where id = p_user_id and status = any (p_from) and role <> 'admin'
    returning id into approved_id;
  else
    -- A new account joining through an invite.
    insert into public.users (tesla_sub, status, approved_at, updated_at)
    values (p_sub, 'approved', now(), now())
    on conflict (tesla_sub) do nothing
    returning id into approved_id;
  end if;

  return case when approved_id is null then 'gone' else 'approved' end;
end;
$$;

comment on function public.approve_within_cap(integer, bigint, text, text[]) is
  'Approves one account if fewer than p_max are approved: an existing one by id (from p_from) or a new one by Tesla sub. Returns approved, full or gone.';

revoke all on function public.approve_within_cap(integer, bigint, text, text[]) from public, anon, authenticated;
grant execute on function public.approve_within_cap(integer, bigint, text, text[]) to service_role;

-- Down:
--   drop function if exists public.approve_within_cap(integer, bigint, text, text[]);
