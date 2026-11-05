import { MILES_TO_KM } from "@/lib/car";
import { chargeStateName } from "@/lib/charge-sessions";
import type { Snapshot } from "@/lib/server/dashboard";
import { compareVersions } from "@/lib/rollout";
import { normaliseVersion } from "@/lib/versions";

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

// The fields a pending update is read from, worked out in this order (see streamedUpdate):
// 1. SoftwareUpdateInProgress true: installing, with the installation percent. That percent alone proves
//    nothing: it climbs in the background long before (10% overnight for an install started at 7:41 AM).
// 2. SoftwareUpdateAvailable true: ready to install. Only now does the car offer it.
// 3. SoftwareUpdateVersion set, neither of those: queued for the car, why is what Tesla's check last said
//    (waiting for Wi-Fi, downloading, scheduled), else just queued. The streamed download percent is not a
//    download: on 5 Nov 2026 2026.38.6 went 0% to 100% in two minutes (10:06 to 10:08 AM IST) while the car's
//    screen said to connect to Wi-Fi to download, SoftwareUpdateAvailable stayed false and the install
//    percent stayed at 3. Fleet Telemetry has no field for waiting on Wi-Fi.
// 4. No version (the car sends " "), or one no newer than the installed Version: nothing.
// Version is the software the car runs: a reading older than its latest one belongs to before an install.
// SoftwareUpdateDownloadPercentComplete is read only as news to ask Tesla about (lib/update-check.ts).
export const UPDATE_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
  "SoftwareUpdateInProgress",
  "SoftwareUpdateAvailable",
  "Version",
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
  const next: Snapshot = { ...snapshot, charge_power_kw: null, charge_energy_kwh: null, time_to_full_h: null };

  const updateAt = Math.max(0, ...UPDATE_FIELDS.map((f) => (stream[f] ? Date.parse(stream[f].at) : 0)));
  if (updateAt > polledAt) Object.assign(next, streamedUpdate(snapshot, stream, polledAt));

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
    // The car counts the energy in for each charge from 0, AC and DC apart, about once a minute. Only readings
    // since the stream's own move into Charging count: a counter newer than the last online check can still be
    // last night's (a streaming car is rarely checked), and would show as energy added now. The counter on the
    // charger this charge's power came from; before that, whichever counted last in this charge.
    const ours = thisCharge(stream);
    const counters = ["ACChargingEnergyIn", "DCChargingEnergyIn"]
      .map((f) => ({ field: f, at: stream[f] ? Date.parse(stream[f].at) : 0, kwh: ours(f) }))
      .filter((c): c is { field: string; at: number; kwh: number } => typeof c.kwh === "number")
      .sort((a, b) => b.at - a.at);
    const charger = power && typeof ours(power.field) === "number" ? power.field.replace("Power", "EnergyIn") : null;
    const energy = charger ? counters.find((c) => c.field === charger) : counters[0];
    if (energy) next.charge_energy_kwh = energy.kwh;
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

// Reads a field's value only when it came since the stream's own move into Charging (a minute's slack), with no
// fallback to the online check: for counters, which keep the last charge's total until the next one starts.
function thisCharge(stream: Stream) {
  const state = stream.DetailedChargeState;
  const since = state && chargeStateName(state.value) === "Charging" ? Date.parse(state.at) - CHARGE_LEAD_MS : null;
  return (field: string) => {
    const reading = stream[field];
    return since !== null && reading && Date.parse(reading.at) >= since ? reading.value : undefined;
  };
}

// Reads a field's value when it belongs to the charge now running. Power is sent only when it changes (three
// times in a 30-minute DC charge), so a reading from before a poll that came mid-charge is still current:
// anything since the stream's own move into Charging counts, as well as anything newer than the poll.
function currentCharge(stream: Stream, fresh: (field: string) => unknown) {
  const ours = thisCharge(stream);
  return (field: string) => ours(field) ?? fresh(field);
}

type UpdatePart = Pick<Snapshot, "update_status" | "update_version" | "download_perc" | "install_perc" | "expected_duration_sec">;

const NO_UPDATE: UpdatePart = { update_status: null, update_version: null, download_perc: null, install_perc: null, expected_duration_sec: null };

// The pending update from the streamed fields, in UPDATE_FIELDS's order. A streamed field counts when it is
// newer than both the check and the car's latest Version reading (one from before that is from before an
// install). Otherwise the check's value stands, as long as the check came after that Version reading: its
// status is Tesla's own answer (vehicle_data's software_update), which telemetry doesn't have.
function streamedUpdate(snapshot: Snapshot, stream: Stream, polledAt: number): UpdatePart {
  const installedAt = stream.Version ? Date.parse(stream.Version.at) : 0;
  const checkCounts = polledAt >= installedAt;
  const current = (field: string) => {
    const reading = stream[field];
    return reading && Date.parse(reading.at) >= installedAt && Date.parse(reading.at) > polledAt ? reading : undefined;
  };
  const streamed = current("SoftwareUpdateVersion");
  const version = streamed ? (typeof streamed.value === "string" ? normaliseVersion(streamed.value) : null) : checkCounts ? snapshot.update_version : null;
  const installed = typeof stream.Version?.value === "string" ? normaliseVersion(stream.Version.value) : null;
  if (!version || (installed && compareVersions(version, installed) <= 0)) return NO_UPDATE;

  // The check's answer, if it came after the install and was about this update (Tesla sometimes sends a
  // status without a version).
  const checkMatches = checkCounts && (!snapshot.update_version || snapshot.update_version === version);
  const poll = checkMatches ? snapshot.update_status : null;
  const num = (field: string, fallback: number | null) => {
    const v = current(field)?.value;
    return typeof v === "number" ? v : checkMatches ? fallback : null;
  };
  const install = num("SoftwareUpdateInstallationPercentComplete", snapshot.install_perc);
  const minutes = num("SoftwareUpdateExpectedDurationMinutes", null);
  const inProgress = current("SoftwareUpdateInProgress")?.value;
  const available = current("SoftwareUpdateAvailable")?.value;
  const part: UpdatePart = {
    update_status: "queued",
    update_version: version,
    // Only the check's download percent: the streamed one moves without a download (see UPDATE_FIELDS).
    download_perc: null,
    install_perc: install == null ? null : Math.round(install),
    expected_duration_sec: minutes != null ? minutes * 60 : checkMatches ? snapshot.expected_duration_sec : null,
  };
  if (inProgress === true || (inProgress === undefined && poll === "installing")) {
    part.update_status = "installing";
  } else if (available === true || (available === undefined && (poll === "available" || poll === "scheduled"))) {
    part.update_status = poll === "scheduled" ? "scheduled" : "available";
  } else if (inProgress === false && available === undefined && poll === "installing") {
    // An install that stopped leaves the update offered.
    part.update_status = "available";
  } else if (poll === "downloading_wifi_wait") {
    part.update_status = poll;
  } else if (poll === "downloading") {
    part.update_status = poll;
    part.download_perc = snapshot.download_perc;
  }
  return part;
}
