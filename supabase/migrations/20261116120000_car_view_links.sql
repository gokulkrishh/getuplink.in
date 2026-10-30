-- View links: an owner makes a link (Settings → View links) and sends it to someone they trust, who then
-- sees the owner's car in Uplink, read-only, until the link ends (30 minutes, 1 hour or 1 day) or the
-- owner ends it. lib/server/view-links.ts makes and checks them.
--
-- Additive. The app works before this runs: Settings says view links aren't set up yet, and a /v link
-- shows the ended page. Apply it any time.

create table public.car_view_links (
  id bigint generated always as identity primary key,
  -- Whose car. Deleting the account deletes its links.
  user_id bigint not null references public.users (id) on delete cascade,
  -- sha256 (hex) of the link's secret (32 random bytes). The secret is shown to the owner once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- The owner's note on who it's for ("Dad").
  label text not null check (length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Set when the owner ends the link, or by Sign out everywhere and Disconnect Tesla.
  revoked_at timestamptz,
  -- How often it was opened and when last. Never who opened it.
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  -- What the link leaves out (phase 2). Fixed once the link is made.
  hide_locations boolean not null default false,
  hide_costs boolean not null default false,
  constraint car_view_links_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '1 day')
);

comment on table public.car_view_links is
  'View links: read-only access to one owner''s car, by a token hash, for up to a day. Service role only.';

-- The owner's list, newest first, and Settings' count of open links.
create index car_view_links_user_idx on public.car_view_links (user_id, created_at desc);
-- token_hash is looked up by its unique index.

alter table public.car_view_links enable row level security;
-- No policies: only the service-role key (server side) can read or write.
revoke all on table public.car_view_links from anon, authenticated;
revoke all on sequence public.car_view_links_id_seq from anon, authenticated;

-- Down:
--   drop table if exists public.car_view_links;
