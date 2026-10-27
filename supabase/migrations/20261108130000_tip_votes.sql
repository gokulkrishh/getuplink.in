-- Owners' votes on the AI tips (the thumbs beside "1 of 3" in the tips box, components/home/week-tips.tsx):
-- "Useful" is 1, "Not useful" is -1, with the kind of finding the tip came from. They're there to learn which
-- kinds of tip work: the owner's net votes per kind move that kind up or down when the tips are ranked (and
-- drop it after 3 net votes against), their latest tips each way steer the AI's wording
-- (lib/server/ai-tips.ts), and Admin > Feedback sums them per kind, the kinds that need work first.
--
-- One vote per owner, page kind (scope, as in drive_wording), page (entity: the IST day's start, a drive's
-- start or a charge's id, as text) and tip; voting again changes it.
--
-- Additive. The app works before this runs: a vote that can't be stored is dropped quietly, and the tips are
-- written without votes. Per owner (user_id), deleted with their data. Service role only.

create table public.tip_votes (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  scope text not null check (scope in ('week', 'drive_tips', 'trip_tips', 'charging', 'charge', 'battery')),
  entity text not null check (length(entity) between 1 and 40),
  kind text not null check (length(kind) between 1 and 40), -- the kind of finding the tip came from (lib/ai-tips.ts)
  tip text not null check (length(tip) between 1 and 400),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, entity, tip)
);

create index tip_votes_user_scope on public.tip_votes (user_id, scope, updated_at desc);
create index tip_votes_kind on public.tip_votes (scope, kind);
create index tip_votes_updated_at on public.tip_votes (updated_at desc);

comment on table public.tip_votes is 'Owners'' useful / not useful votes on AI tips. Per user; service role only.';

alter table public.tip_votes enable row level security;
-- No policies: only the service-role key (server side) can read or write, like the other owner tables.
revoke all on table public.tip_votes from anon, authenticated;

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   drop table if exists public.tip_votes;
