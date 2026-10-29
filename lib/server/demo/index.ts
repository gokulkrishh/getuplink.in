import type { InvoiceDetail } from "@/lib/invoice-details";
import "server-only";
import { MILES_TO_KM } from "@/lib/car";
import { buildSessions, CHARGE_FIELDS } from "@/lib/charge-sessions";
import { type DemoScenario, demoScenario } from "@/lib/demo";
import type { CounterColumn } from "@/lib/driving-figures";
import type { InvoiceLine } from "@/lib/invoice-items";
import { stationAt } from "@/lib/stations";
import type { Stream } from "@/lib/telemetry";
import { istDay, istDayStart, num, type Reading } from "@/lib/telemetry-derive";
import type { ChargingSession } from "../charging";
import type { StreamChargeSession } from "../stream-charging";
import { type DemoFleet, generateFleet } from "./fleet";
import { type DemoData, generateDemo, PENDING_VERSION } from "./generate";

// Everything the loaders return in demo mode comes from here. The data is rebuilt at most once a
// minute, so "6 minutes ago" stays about right while one page's loaders all see the same car.
let cached: DemoData | undefined;

export function demoData(): DemoData {
  const now = Date.now();
  if (!cached || now - cached.now > 60_000) {
    const data = generateDemo(now);
    cached = demoScenario() === "justConnected" ? blankSlate(data) : data;
  }
  return cached;
}

// The Just connected scenario: the same car, but as it is minutes after setup. Uplink has made one check
// (the version and battery from it), and the car has sent no live data yet, so there are no readings, no
// drives, no charges and no earlier updates.
function blankSlate(data: DemoData): DemoData {
  const first = { ...data.snapshot, charging_state: "Disconnected", charge_power_kw: null, time_to_full_h: null };
  return {
    ...data,
    snapshot: first,
    readings: {},
    teslaSessions: [],
    history: [
      { version: first.car_version ?? data.vehicle.current_version ?? "", previous_version: null, detected_at: first.polled_at, available_at: null, odometer_km: Math.round(data.odometerMiles * MILES_TO_KM) },
    ],
  };
}

// The simulated fleet for /rollout and /admin, rebuilt on the same minute as the demo car.
let fleet: DemoFleet | undefined;

export function demoFleet(): DemoFleet {
  const now = Date.now();
  if (!fleet || now - fleet.now > 60_000) fleet = generateFleet(now);
  return fleet;
}

// ---- Fleet Telemetry ----

// One field's readings in a window, oldest first.
export function demoReadings(field: string, from: string, to?: string): Reading[] {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Infinity;
  return (demoData().readings[field] ?? []).filter((r) => Date.parse(r.at) >= start && Date.parse(r.at) < end);
}

// The value of a field's last reading before an instant (or its latest, with none).
export function demoCounter(field: string, before: string | null): number | null {
  const readings = demoData().readings[field] ?? [];
  const limit = before ? Date.parse(before) : Infinity;
  const last = readings.findLast((r) => Date.parse(r.at) < limit);
  return num(last?.value);
}

// loadCounters for the demo car: each field's first reading, and its last reading before each instant
// (Infinity: the latest), with when they were read. `since` drops the readings before it, like a car
// connected then (the First week scenario).
export function demoCounters(fields: string[], instants: number[], since = -Infinity): Map<string, CounterColumn> {
  const data = demoData();
  return new Map(
    fields.map((field) => {
      const readings = (data.readings[field] ?? [])
        .map((r) => ({ value: num(r.value), at: Date.parse(r.at) }))
        .filter((r): r is { value: number; at: number } => r.value !== null && r.at >= since);
      return [field, { first: readings[0] ?? null, bounds: instants.map((t) => readings.findLast((r) => r.at < t) ?? null) }];
    }),
  );
}

// When the First week scenario's car was connected: four days ago, at the start of the IST day.
export function demoFirstWeekStart(): number {
  return istDayStart(istDay(demoData().now) - 4);
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
      // The history itself ends in a charge (see generateDemo), so the session list and the parked
      // stretch agree with the stream; laying values over the stream alone would not reach them.
      return {};
    case "updating":
      return {
        SoftwareUpdateVersion: PENDING_VERSION,
        SoftwareUpdateExpectedDurationMinutes: 45,
        SoftwareUpdateDownloadPercentComplete: 42,
        SoftwareUpdateInstallationPercentComplete: 1,
        SoftwareUpdateInProgress: false,
      };
    case "installing":
      return {
        SoftwareUpdateVersion: PENDING_VERSION,
        SoftwareUpdateExpectedDurationMinutes: 45,
        SoftwareUpdateDownloadPercentComplete: 100,
        SoftwareUpdateInstallationPercentComplete: 63,
        SoftwareUpdateInProgress: true,
      };
    default:
      // The one state the demo shows: charging (from the history), with no update under way. The updating
      // and installing scenarios still show one.
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

// ---- Sessions ----

// Streamed sessions, rebuilt from the readings by the same function the real sync uses. Newest first.
const DEMO_STATIONS = [
  [12.91546, 77.61589], // Magenta, BTM
  [12.99474, 77.6993], // BESCOM, Mahadevapura
  [12.97254, 77.70781], // Shell, Marathahalli
]
  .map(([lat, lon]) => stationAt(lat, lon))
  .filter((label): label is string => label !== null);

export function demoStreamSessions(): StreamChargeSession[] {
  const data = demoData();
  const readings = CHARGE_FIELDS.flatMap((field) => (data.readings[field] ?? []).map((r) => ({ field, at: r.at, value: r.value })));
  // Third-party DC sessions take turns at real Bengaluru stations from the OpenStreetMap extract, as the
  // station check would name them; AC charging (at home) stays unnamed.
  let dc = 0;
  return buildSessions(readings)
    .map((s, i) => ({
      ...s,
      id: i + 1,
      vin: data.vin,
      // The second one has no station nearby in OpenStreetMap; its invoice names it (see demoInvoices).
      station_name: s.kind === "dc" && !s.supercharger ? (dc++ === 1 ? null : (DEMO_STATIONS[dc % DEMO_STATIONS.length] ?? null)) : null,
    }))
    .reverse();
}

// Invoices for the demo's third-party DC charges, as the Grok bot would attach them: billed a little over
// what the car added, at ₹17.50/kWh (₹16.50 of it energy, the rest a service fee) with 18% GST (₹20.65 in
// all, as Indian CCS networks charge), every fourth one left out so some show "Cost not available". The first one also has its lines, as the bot sends them
// with line_items: energy, a session fee, CGST and SGST at 9% each, and the round-off.
type DemoInvoice = {
  amount: number;
  kwhBilled: number | null;
  network: string;
  station: string | null;
  gst: number;
  energyAmount: number;
  lines: InvoiceLine[] | null;
  invoiceNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  details: InvoiceDetail[];
};

const ENERGY_RATE = 16.5; // ₹ a kWh before GST
const FEE_RATE = 1; // ₹ a kWh, the service fee
const cents = (n: number) => Math.round(n * 100) / 100;

function demoLines(kwhBilled: number, amount: number): InvoiceLine[] {
  const energy = cents(kwhBilled * ENERGY_RATE);
  const fee = cents(kwhBilled * FEE_RATE);
  const tax = cents((energy + fee) * 0.09);
  const lines: InvoiceLine[] = [
    { label: "Energy charges", kind: "energy", amount: energy, kwh: kwhBilled, rate: ENERGY_RATE },
    { label: "Session fee", kind: "fee", amount: fee },
    { label: "CGST", kind: "tax", amount: tax, taxRate: 9 },
    { label: "SGST", kind: "tax", amount: tax, taxRate: 9 },
  ];
  const rest = Math.round(amount * 100) - lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0);
  return rest === 0 ? lines : [...lines, { label: "Round off", kind: "other", amount: rest / 100 }];
}

export function demoInvoices(): Map<number, DemoInvoice> {
  const out = new Map<number, DemoInvoice>();
  demoStreamSessions()
    .filter((s) => s.kind === "dc" && !s.supercharger && s.ended_at !== null && s.energy_added_kwh)
    .forEach((s, k) => {
      if (k % 4 === 3 && s.station_name) return;
      const kwhBilled = Math.round(s.energy_added_kwh! * 1.04 * 100) / 100;
      const amount = Math.round(kwhBilled * (ENERGY_RATE + FEE_RATE) * 1.18 * 100) / 100;
      // The first one, with its lines, also has the details a bill prints, as the bot sends them.
      const details: InvoiceDetail[] = k === 0 ? [{ label: "Duration", value: "21 mins 48 secs" }, { label: "Paid by", value: "App wallet" }, { label: "Station ID", value: "VP-1042" }, { label: "Charger ID", value: "VP-1042-DC2" }] : [];
      out.set(s.id, {
        amount,
        kwhBilled,
        lines: k === 0 ? demoLines(kwhBilled, amount) : null,
        invoiceNumber: k === 0 ? `VP-2026-${String(s.id).padStart(5, "0")}` : null,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        details,
        ...(s.station_name ? { network: s.station_name.split(",")[0], station: null } : { network: "VoltPoint", station: "Lakeview Fuels, Ring Road" }), gst: Math.round((amount - amount / 1.18) * 100) / 100, energyAmount: Math.round(kwhBilled * ENERGY_RATE * 100) / 100,
      });
    });
  return out;
}

// Area names for the demo's places, as Nominatim would give them.
export const DEMO_PLACES: [lat: number, lng: number, name: string][] = [
  [12.9352, 77.6245, "Koramangala, Bengaluru"],
  [12.9698, 77.75, "Whitefield, Bengaluru"],
  [12.9784, 77.6408, "Indiranagar, Bengaluru"],
  [13.0358, 77.597, "Hebbal, Bengaluru"],
  [12.9166, 77.6101, "BTM Layout, Bengaluru"],
  [12.2958, 76.6394, "Mysuru"],
];

export function demoChargingSessions(): ChargingSession[] {
  return demoData().teslaSessions;
}

// A demo Supercharger bill's fee lines, in Tesla's charging-history shape: the charging line carries the
// whole cost, and the idle-fee line is the zero one Tesla sends when the car left in time.
export function demoChargingFees(sessionId: string): unknown {
  const s = demoData().teslaSessions.find((t) => t.session_id === sessionId);
  if (!s || s.energy_kwh === null || s.cost_total === null) return null;
  return [
    { feeType: "CHARGING", currencyCode: "INR", usageBase: s.energy_kwh, totalDue: s.cost_total, uom: "kwh" },
    { feeType: "PARKING", currencyCode: "INR", usageBase: 0, totalDue: 0, uom: "min" },
  ];
}
