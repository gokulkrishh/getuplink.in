import { MILES_TO_KM } from "@/lib/car";
import type { Snapshot } from "@/lib/server/dashboard";

export type StreamValue = { at: string; value: unknown };
// Latest streamed reading per Fleet Telemetry field.
export type Stream = Record<string, StreamValue>;

const UPDATE_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
];

// Streamed values that are newer than the poll, laid over the poll's snapshot. polled_at is left
// alone so "Last checked" keeps describing the poll.
export function applyStream(snapshot: Snapshot | null, stream: Stream): Snapshot | null {
  if (!snapshot) return null;
  const polledAt = Date.parse(snapshot.polled_at);
  const fresh = (field: string) => {
    const reading = stream[field];
    return reading && Date.parse(reading.at) > polledAt ? reading.value : undefined;
  };
  const next: Snapshot = { ...snapshot, charge_power_kw: null };

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
    // AC and DC power are separate fields; the one reported last belongs to the running session.
    const power = ["ACChargingPower", "DCChargingPower"]
      .map((f) => ({ at: stream[f] ? Date.parse(stream[f].at) : 0, kw: fresh(f) }))
      .filter((p): p is { at: number; kw: number } => typeof p.kw === "number")
      .sort((a, b) => b.at - a.at)[0];
    if (power) next.charge_power_kw = power.kw;
  }
  return next;
}
