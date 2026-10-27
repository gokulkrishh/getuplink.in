-- The feedback form asks one question (what it's about: something wrong, hard to understand, an idea, or
-- something liked) and, for the first two only, how much it bothers the owner. Two separate questions
-- let an owner pick "Love it" with "Something's wrong".
--
-- feeling becomes bother (little or lot, null for ideas and praise); topic 'other' becomes 'praise'. The
-- table is a day old and holds only test rows, which are carried over.

alter table public.feedback drop constraint feedback_feeling_check;
alter table public.feedback drop constraint feedback_topic_check;
alter table public.feedback rename column feeling to bother;
alter table public.feedback alter column bother drop not null;
update public.feedback set bother = case bother when 'frustrated' then 'lot' when 'confused' then 'little' else null end;
update public.feedback set topic = 'idea' where topic = 'other';
alter table public.feedback add constraint feedback_bother_check check (bother is null or bother in ('little', 'lot'));
alter table public.feedback add constraint feedback_topic_check check (topic in ('broken', 'confusing', 'idea', 'praise'));

comment on column public.feedback.bother is 'For a problem: how much it bothers the owner, little or lot. Null for ideas and praise.';

notify pgrst, 'reload schema';
