import { MILES_TO_KM } from "@/lib/car";
import { chargeStateName } from "@/lib/charge-sessions";
import type { Snapshot } from "@/lib/server/dashboard";

export type StreamValue = { at: string; value: unknown };
// Latest streamed reading per Fleet Telemetry field.
export type Stream = Record<string, StreamValue>;

// A counter_values_at row: `at` is the boundary asked for, or null for the field's first reading ever.
export type BoundReading = { field: string; at: string | null; value: unknown; created_at: string | null };

// The latest reading per field from counter_values_at rows read at one boundary (see loadStream): the
// boundary's row, never the first-ever one, and nothing for a field with no reading before it.
export function latestByField(rows: BoundReading[]): Stream {
  const stream: Stream = {};
  for (const row of rows) {
    if (row.at === null || row.created_at === null) continue;
    stream[row.field] = { at: row.created_at, value: row.value };
  }
  return stream;
}

// The fields a pending update is read from.
export const UPDATE_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
];

// Streamed values that are newer than the poll, laid over the poll's snapshot. polled_at is left
// alone so it keeps describing the poll (lastSyncedText weighs it against the streamed times).
export function applyStream(snapshot: Snapshot | null, stream: Stream): Snapshot | null {
  if (!snapshot) return null;
  const polledAt = Date.parse(snapshot.polled_at);
  const fresh = (field: string) => {
    const reading = stream[field];
    return reading && Date.parse(reading.at) > polledAt ? reading.value : undefined;
  };
  const next: Snapshot = { ...snapshot, charge_power_kw: null, time_to_full_h: null };

  const updateAt = Math.max(0, ...UPDATE_FIELDS.map((f) => (stream[f] ? Date.parse(stream[f].at) : 0)));
  if (updateAt > polledAt) {
    // Telemetry rows only arrive on change, so unchanged fields fall back to the poll's values.
    const raw = stream.SoftwareUpdateVersion?.value;
    const version = typeof raw === "string" ? raw.trim() : (snapshot.update_version ?? "");
    if (!version) {
      next.update_status = null;
      next.update_version = null;
      next.download_perc = null;
      next.install_perc = null;
      next.expected_duration_sec = null;
    } else {
      const num = (field: string, fallback: number | null) => {
        const v = stream[field]?.value;
        return typeof v === "number" ? v : fallback;
      };
      const download = num("SoftwareUpdateDownloadPercentComplete", snapshot.download_perc);
      const install = num("SoftwareUpdateInstallationPercentComplete", snapshot.install_perc);
      const minutes = stream.SoftwareUpdateExpectedDurationMinutes?.value;
      const downloadPerc = download == null ? null : Math.round(download);
      const installPerc = install == null ? null : Math.round(install);
      const poll = snapshot.update_status;
      next.update_version = version;
      next.download_perc = downloadPerc;
      next.install_perc = installPerc;
      if (typeof minutes === "number") next.expected_duration_sec = minutes * 60;
      if (downloadPerc != null && downloadPerc < 100) {
        next.update_status = poll === "downloading_wifi_wait" && downloadPerc === snapshot.download_perc ? poll : "downloading";
      } else if (downloadPerc != null && installPerc != null && installPerc > 1) {
        next.update_status = "installing";
      } else {
        next.update_status = poll === "available" || poll === "scheduled" || poll === "installing" ? poll : "available";
      }
    }
  }

  const level = fresh("BatteryLevel");
  if (typeof level === "number") next.battery_level = Math.round(level);
  const range = fresh("RatedRange");
  if (typeof range === "number") next.battery_range_km = Math.round(range * MILES_TO_KM * 10) / 10;
  const limit = fresh("ChargeLimitSoc");
  if (typeof limit === "number") next.charge_limit = limit;
  const charging = fresh("DetailedChargeState");
  if (typeof charging === "string") next.charging_state = charging.replace(/^DetailedChargeState/, "");
  if (next.charging_state === "Charging") {
    const current = currentCharge(stream, fresh);
    // AC and DC power are separate fields; the one reported last belongs to the running session.
    const power = ["ACChargingPower", "DCChargingPower"]
      .map((f) => ({ field: f, at: stream[f] ? Date.parse(stream[f].at) : 0, kw: current(f) }))
      .filter((p): p is { field: string; at: number; kw: number } => typeof p.kw === "number")
      .sort((a, b) => b.at - a.at)[0];
    if (power) next.charge_power_kw = power.kw;
    // Hours, as in Tesla's vehicle_data time_to_full_charge. It is the car's own estimate, and on a
    // third-party DC charger it ran at about half the real time: 0.25 h (15 min) at 21:26 on 25 Oct 2026 for a
    // charge that took until 21:55, half the real time all the way through. So it shows only where the car
    // knows the charger: AC, and Superchargers.
    const thirdPartyDc =
      power?.field === "DCChargingPower" && !(typeof stream.FastChargerType?.value === "string" && /supercharger/i.test(stream.FastChargerType.value));
    const toFull = current("TimeToFullCharge");
    if (!thirdPartyDc && typeof toFull === "number" && toFull > 0) next.time_to_full_h = toFull;
  }
  return next;
}

// A minute of slack: the first power reading can land just before the state says Charging (26 s on 25 Oct).
const CHARGE_LEAD_MS = 60_000;

// Reads a field's value when it belongs to the charge now running. Power is sent only when it changes (three
// times in a 30-minute DC charge), so a reading from before a poll that came mid-charge is still current:
// anything since the stream's own move into Charging counts, as well as anything newer than the poll.
function currentCharge(stream: Stream, fresh: (field: string) => unknown) {
  const state = stream.DetailedChargeState;
  const since = state && chargeStateName(state.value) === "Charging" ? Date.parse(state.at) - CHARGE_LEAD_MS : null;
  return (field: string) => {
    const reading = stream[field];
    if (since !== null && reading && Date.parse(reading.at) >= since) return reading.value;
    return fresh(field);
  };
}
