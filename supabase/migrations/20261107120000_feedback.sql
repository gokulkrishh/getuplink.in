-- Feedback owners send from the button on every signed-in page (components/feedback-button.tsx), read on
-- Admin > Feedback. Each row says how the owner felt, what it was about, their words, and where they were:
-- the page's path and title, the screen size, the browser, the theme and the app's build, so a report can be
-- traced without asking them again.
--
-- Additive. Per owner (user_id), deleted with their data ("Delete my data" and account deletion). Service
-- role only, like the other owner tables.

create table public.feedback (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  feeling text not null check (feeling in ('love', 'fine', 'confused', 'frustrated')),
  topic text not null check (topic in ('broken', 'confusing', 'idea', 'other')),
  message text not null check (length(message) between 1 and 2000),
  page_path text not null check (length(page_path) between 1 and 300),
  page_title text check (length(page_title) <= 200),
  viewport text check (length(viewport) <= 20),     -- "390x844"
  user_agent text check (length(user_agent) <= 400),
  theme text check (theme in ('light', 'dark')),
  app_version text check (length(app_version) <= 40) -- the deployment's commit, short
);

create index feedback_created_at on public.feedback (created_at desc);
create index feedback_user on public.feedback (user_id, created_at desc);

comment on table public.feedback is 'Feedback owners send from the app, with the page they were on. Per user; service role only.';

alter table public.feedback enable row level security;
-- No policies: only the service-role key (server side) can read or write, like the other owner tables.
revoke all on table public.feedback from anon, authenticated;

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   drop table if exists public.feedback;
