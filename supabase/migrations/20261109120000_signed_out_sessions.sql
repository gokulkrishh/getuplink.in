-- Sign out ends that one session on the server too, not only by deleting the browser's cookie: a copied
-- cookie stops working. Each entry is a signed-out session's issued-at time (ms), the cookie's second part
-- (lib/session.ts). Entries older than a session's 30 days are dropped when the next one is added.
--
-- Additive: an empty list changes nothing.

alter table public.users add column if not exists signed_out_sessions bigint[] not null default '{}';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.users drop column signed_out_sessions;
