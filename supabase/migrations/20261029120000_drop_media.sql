-- Uplink no longer collects what's playing in the car or the paired phone's name. The telemetry config
-- stops asking for Media* fields and the receiver drops any that still arrive (fly/telemetry/worker.ts);
-- the poll stops saving vehicle_state.media_info (lib/stored-raw.ts). This removes what was stored before.
-- Run it after the receiver and app deploys, so nothing new arrives behind it.

-- Every Media* field the old config subscribed to. Each car's VINs are found by walking the
-- (vin, field, created_at) unique index, so each delete is an index range scan, not a full table scan.
with recursive vins (vin) as (
  (select t.vin from public.telemetry_readings t order by t.vin limit 1)
  union all
  select (select t.vin from public.telemetry_readings t where t.vin > v.vin order by t.vin limit 1)
  from vins v
  where v.vin is not null
)
delete from public.telemetry_readings t
using vins v
cross join unnest(array[
  'MediaPlaybackStatus', 'MediaPlaybackSource', 'MediaAudioVolume', 'MediaNowPlayingDuration',
  'MediaNowPlayingElapsed', 'MediaNowPlayingArtist', 'MediaNowPlayingTitle', 'MediaNowPlayingAlbum',
  'MediaNowPlayingStation', 'MediaAudioVolumeIncrement', 'MediaAudioVolumeMax'
]) as f (field)
where t.vin = v.vin and t.field = f.field;

-- media_info holds a2dp_source_name (the phone's Bluetooth name) and the now-playing details. Only rows
-- that have it are rewritten.
update public.snapshots
set raw = raw #- '{vehicle_state,media_info}'
where raw -> 'vehicle_state' ? 'media_info';

-- Rollback: none. The deleted values are gone by design.
