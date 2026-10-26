-- Invite links (docs/signup-plan.md, step 7): the admin makes a link for one friend's car, and the first
-- Tesla sign-in through it whose vehicle list has that car joins as approved.
--
-- Additive. The app works before this runs: the admin page says invites aren't set up yet, an invite link
-- reads as not working, and sign-in without one is unchanged. Apply it any time.

create table public.invites (
  id bigint generated always as identity primary key,
  -- sha256 (hex) of the link's token. The token itself is never stored: the server rebuilds it from a key
  -- in its env, created_at and vin_suffix (lib/server/invites.ts), so the table alone can't make a link.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- The last 6 characters of the friend's VIN, upper case. Never the whole VIN.
  vin_suffix text not null check (vin_suffix ~ '^[A-Z0-9]{6}$'),
  -- The admin's own note ("Arun's Model Y"). No email, no name required.
  label text check (label is null or length(label) between 1 and 60),
  created_by bigint references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Single use: set once, by the sign-in that claims it.
  used_at timestamptz,
  used_by bigint references public.users (id) on delete set null,
  -- Who joined, for the admin's list: the car's model and the last 4 of its VIN ("Model Y · 4821").
  -- Cleared when that account is deleted.
  joined_label text check (joined_label is null or length(joined_label) between 1 and 40),
  revoked_at timestamptz,
  constraint invites_expiry_check check (expires_at > created_at)
);

comment on table public.invites is
  'Invite links: a token hash, the last 6 VIN characters, single use, one day. Service role only.';

-- The admin's list, newest first.
create index invites_created_at_idx on public.invites (created_at desc);
-- The foreign key from users (on delete set null) and Delete account's clean-up.
create index invites_used_by_idx on public.invites (used_by) where used_by is not null;
create index invites_created_by_idx on public.invites (created_by) where created_by is not null;

alter table public.invites enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.invites from anon, authenticated;
revoke all on sequence public.invites_id_seq from anon, authenticated;

-- Down:
--   drop table if exists public.invites;
