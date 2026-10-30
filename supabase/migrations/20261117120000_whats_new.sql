-- The Home cards that show once per owner (lib/whats-new.ts).
-- welcomed_at: when the owner closed the welcome card. Null means not yet.
-- whats_new_seen: id of the newest What's new entry the owner has seen. Null means none.
-- Additive. Before this runs, Home shows neither card and the What's new page still lists entries.

alter table public.users add column if not exists welcomed_at timestamptz;
alter table public.users add column if not exists whats_new_seen text;

comment on column public.users.welcomed_at is 'When the owner closed the welcome card on Home; null until then.';
comment on column public.users.whats_new_seen is 'Id of the newest What''s new entry the owner has seen (ids sort by date).';

-- Rollback (manual, not run):
--   alter table public.users drop column if exists welcomed_at, drop column if exists whats_new_seen;
