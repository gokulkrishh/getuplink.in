-- The card on home that asks an owner who doesn't share whether they'd like to share with other owners
-- (lib/share-nudge.ts). It never turns sharing on; these columns only say when the card may show.
--
-- share_nudge_dismissals / share_nudge_dismissed_at: each "Not now". The card waits 30 days after one and
-- never shows again after the third.
-- share_nudge_show_from / share_nudge_show_until: the nightly decision's yes (app/api/cron/owners, after the
-- owners run), lasting until about the next night's decision. Null for a no or no answer, so the card doesn't
-- show.
--
-- share_stopped_at (below): an owner who turned sharing off is never asked again.
--
-- Additive. Before this runs, home shows no card, Not now does nothing, the nightly decision skips and
-- turning sharing on or off works as before.

alter table public.users add column if not exists share_nudge_dismissals smallint not null default 0
  check (share_nudge_dismissals >= 0);
alter table public.users add column if not exists share_nudge_dismissed_at timestamptz;
alter table public.users add column if not exists share_nudge_show_from timestamptz;
alter table public.users add column if not exists share_nudge_show_until timestamptz;

comment on column public.users.share_nudge_dismissals is 'Times the owner tapped Not now on the share card; at 3 it never shows again.';
comment on column public.users.share_nudge_dismissed_at is 'The last Not now on the share card.';
comment on column public.users.share_nudge_show_from is 'Start of the share card''s window from the nightly decision; null when none.';
comment on column public.users.share_nudge_show_until is 'End of the share card''s window from the nightly decision; null when none.';

-- share_stopped_at: when the owner last turned sharing off. They chose not to share, so the card never asks
-- them again. Turning sharing on or off also clears the window above.
alter table public.users add column if not exists share_stopped_at timestamptz;
comment on column public.users.share_stopped_at is 'When the owner last turned sharing off; the share card never asks them again.';
