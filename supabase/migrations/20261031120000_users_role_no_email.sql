-- Step 6 of docs/signup-plan.md: the waitlist takes no email, and admin is a role on the users row.
--
-- Additive, and safe under the code deployed before it: that code never reads `role` and never writes a
-- waitlist row. Apply it BEFORE deploying the code that reads `role` (lib/server/data/system.ts userRole).
--
-- Nobody is made an admin here. After applying, set the owner's row by hand:
--   update public.users set role = 'admin' where tesla_sub = '<tesla sub>';

-- 1. No email at all: a waitlisted user no longer needs one. The email column stays, unused and null,
-- until step 4's cleanup drops it with the other single-owner leftovers.
alter table public.users drop constraint if exists users_waitlist_email_check;

-- 2. Admin by role. A constant default is a metadata-only change (no table rewrite), and the check is
-- validated against existing rows, all of which get the default.
alter table public.users
  add column if not exists role text not null default 'user'
    constraint users_role_check check (role in ('user', 'admin'));

comment on column public.users.role is 'user, or admin: can open /admin and decide the waitlist. Set by hand.';

-- users keeps RLS on with no policies (service role only); nothing to grant.

-- Down:
--   alter table public.users drop column if exists role;
--   -- The email check can't come back once a waitlist row has no email.
