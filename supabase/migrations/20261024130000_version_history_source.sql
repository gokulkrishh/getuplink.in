-- Version history can now start before tracking began: rows the owner imports are marked 'imported'.
-- The column already exists from the first migration (default 'poll'); rows the poller writes are 'tracked'.

alter table public.version_history alter column source set default 'tracked';

update public.version_history set source = 'tracked' where source <> 'imported';

alter table public.version_history
  add constraint version_history_source_check check (source in ('tracked', 'imported'));
