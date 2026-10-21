-- Versions are also recorded from the Fleet Telemetry stream (lib/server/stream-versions.ts), with the
-- time the car reported as detected_at. Two syncs running at once would insert the same change with
-- the same time; this makes the second insert fail instead of duplicating the row.
create unique index if not exists version_history_vehicle_detected_key
  on public.version_history (vehicle_id, detected_at);
