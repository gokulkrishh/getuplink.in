import "server-only";
import { buildSessions, CHARGE_FIELDS } from "@/lib/charge-sessions";
import { MILES_TO_KM } from "@/lib/car";
import { type WeekSummary, weekSummary } from "@/lib/dashboard-summary";
import type { DemoScenario } from "@/lib/demo";
import type { Stream } from "@/lib/telemetry";
import { istDay, istDayStart, num, type Reading, type UpdateRow } from "@/lib/telemetry-derive";
import type { ChargingSession } from "../charging";
import type { VersionChange } from "../dashboard";
import type { StreamChargeSession } from "../stream-charging";
import { type DemoData, generateDemo, PENDING_VERSION } from "./generate";

// Everything the loaders return in demo mode comes from here. The data is rebuilt at most once a
// minute, so "6 minutes ago" stays about right while one page's loaders all see the same car.
let cached: DemoData | undefined;
// Settings > Import past updates in demo mode: the imported rows, kept in memory until the server restarts.
// Undefined until the first import or undo; until then the generated ones stand.
let imported: VersionChange[] | undefined;

export function demoData(): DemoData {
  const now = Date.now();
  if (!cached || now - cached.now > 60_000) cached = generateDemo(now);
  if (!imported) return cached;
  const history = [...cached.history.filter((h) => h.source === "tracked"), ...imported].sort(
    (a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at),
  );
  return { ...cached, history };
}

export function setDemoImported(rows: VersionChange[]): void {
  imported = rows;
}

// ---- Fleet Telemetry ----

// One field's readings in a window, oldest first.
export function demoReadings(field: string, from: string, to?: string): Reading[] {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Infinity;
  return (demoData().readings[field] ?? []).filter((r) => Date.parse(r.at) >= start && Date.parse(r.at) < end);
}

// The value of a field's last reading before an instant (or its latest, with none), or its first ever.
export function demoCounter(field: string, before: string | null, ascending = false): number | null {
  const readings = demoData().readings[field] ?? [];
  if (ascending) return num(readings[0]?.value);
  const limit = before ? Date.parse(before) : Infinity;
  const last = readings.findLast((r) => Date.parse(r.at) < limit);
  return num(last?.value);
}

export function demoLastReadingAt(): string | null {
  let newest = 0;
  for (const readings of Object.values(demoData().readings)) newest = Math.max(newest, Date.parse(readings[readings.length - 1].at));
  return newest ? new Date(newest).toISOString() : null;
}

// The readings a scenario adds on top of the quiet history, a minute and a half old.
function scenarioReadings(scenario: DemoScenario): Record<string, unknown> {
  switch (scenario) {
    case "charging":
      return {
        DetailedChargeState: "DetailedChargeStateCharging",
        ACChargingPower: 7.2,
        TimeToFullCharge: 1.3,
        BatteryLevel: 66,
        RatedRange: Math.round(((0.66 * 434) / MILES_TO_KM) * 10) / 10,
      };
    case "updating":
      return {
        SoftwareUpdateVersion: PENDING_VERSION,
        SoftwareUpdateExpectedDurationMinutes: 45,
        SoftwareUpdateDownloadPercentComplete: 42,
        SoftwareUpdateInstallationPercentComplete: 1,
      };
    case "installing":
      return {
        SoftwareUpdateVersion: PENDING_VERSION,
        SoftwareUpdateExpectedDurationMinutes: 45,
        SoftwareUpdateDownloadPercentComplete: 100,
        SoftwareUpdateInstallationPercentComplete: 63,
      };
    default:
      return {};
  }
}

// The latest reading per field, like telemetry.ts's loadStream, with a scenario laid over the newest.
export function demoStream(fields: string[], scenario: DemoScenario = "normal"): Stream {
  const data = demoData();
  const stream: Stream = {};
  for (const field of fields) {
    const last = data.readings[field]?.at(-1);
    if (last) stream[field] = { at: last.at, value: last.value };
  }
  const at = new Date(data.now - 90_000).toISOString();
  for (const [field, value] of Object.entries(scenarioReadings(scenario))) {
    if (fields.includes(field)) stream[field] = { at, value };
  }
  return stream;
}

// The dashboard's "This week" for a car connected four days ago: the same readings, cut at that day, with
// nothing before them, so the card says "Tracking since" instead of comparing.
export function demoFirstWeek(): WeekSummary {
  const { now } = demoData();
  const from = new Date(istDayStart(istDay(now) - 4)).toISOString();
  return weekSummary(demoReadings("Odometer", from), null, demoReadings("LifetimeEnergyUsed", from), null, now);
}

// ---- Sessions ----

// Streamed sessions, rebuilt from the readings by the same function the real sync uses. Newest first.
export function demoStreamSessions(): StreamChargeSession[] {
  const data = demoData();
  const readings = CHARGE_FIELDS.flatMap((field) => (data.readings[field] ?? []).map((r) => ({ field, at: r.at, value: r.value })));
  return buildSessions(readings)
    .map((s, i) => ({ ...s, id: i + 1, vin: data.vin }))
    .reverse();
}

export function demoChargingSessions(): ChargingSession[] {
  return demoData().teslaSessions;
}

// ---- Updates ----

// Real updates only, oldest first.
export function demoUpdateRows(): UpdateRow[] {
  return demoData()
    .history.filter((h) => h.previous_version)
    .map((h) => ({ detected_at: h.detected_at, available_at: h.available_at, source: h.source }))
    .reverse();
}
