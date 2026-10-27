-- Where the admin is with each piece of feedback: new until read, then read, then done. Admin > Feedback
-- marks it, and the tab shows a dot while any is new.
--
-- Additive: a small table, so the default fills existing rows at once.

alter table public.feedback
  add column status text not null default 'new' check (status in ('new', 'read', 'done'));

comment on column public.feedback.status is 'Where the admin is with it: new (unread), read, or done.';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.feedback drop column if exists status;
