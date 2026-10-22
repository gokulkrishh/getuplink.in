-- Imported updates (Settings > Import past updates) are de-duplicated by version. The app checks first;
-- this makes two imports running at once fail instead of saving a version twice. Tracked rows are left out:
-- a car can legitimately be recorded on the same version twice (e.g. after a rollback).
create unique index if not exists version_history_imported_version_key
  on public.version_history (vehicle_id, version)
  where source = 'imported';
