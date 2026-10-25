// What of a vehicle_data response the poll keeps in snapshots.raw (shown at /api/debug).

// Never stored: the sign-in tokens Tesla echoes back, and drive_state, which holds where the car is.
const DROPPED_KEYS = ["tokens", "backseat_token", "backseat_token_updated_at", "drive_state"];
// Never stored from vehicle_state: media_info holds the paired phone's name (a2dp_source_name) and what
// was playing. Uplink shows none of it.
const DROPPED_VEHICLE_STATE_KEYS = ["media_info"];

const without = (obj: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

// A copy of the response without those keys; the response itself is left as it was.
export function storedRaw(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const kept = without(data, DROPPED_KEYS);
  if (isObject(kept.vehicle_state)) kept.vehicle_state = without(kept.vehicle_state, DROPPED_VEHICLE_STATE_KEYS);
  return kept;
}
