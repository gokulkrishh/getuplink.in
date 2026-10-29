import "server-only";
import { cache } from "react";
import { DEMO } from "@/lib/demo";
import { demoData, demoLastReadingAt, demoReadings, demoStream } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { type BoundReading, latestByField, type Stream } from "@/lib/telemetry";
import type { Reading } from "@/lib/telemetry-derive";
import { LATEST } from "./energy";
import { PRESENCE_FIELDS } from "@/lib/awake";

export { applyStream } from "@/lib/telemetry";

export const STREAM_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
  "BatteryLevel",
  "RatedRange",
  "ChargeLimitSoc",
  "DetailedChargeState",
  "ACChargingPower",
  "DCChargingPower",
  "TimeToFullCharge",
  // Which charger the car is on, so a third-party DC charge leaves out the car's time-to-full estimate.
  "FastChargerType",
  // Home's Sentry Mode mark (sentryOn).
  "SentryMode",
];

// Each field's last reading strictly before `before` (an ISO time, or LATEST for the newest of all), in one
// request: counter_values_at steps back once per field on the (vin, field, created_at) unique index (it
// also returns each first reading, which is dropped). Throws on a read error.
export async function readingsBefore(owner: Owner, vin: string, fields: string[], before: string): Promise<Stream> {
  if (fields.length === 0) return {};
  const { data, error } = await ownerDb(owner).rpc("counter_values_at", { p_vin: vin, p_fields: fields, p_at: [before] });
  if (error) throw new Error(error.message);
  return latestByField(data as BoundReading[]);
}

// Latest Fleet Telemetry reading per field (STREAM_FIELDS unless given). Rows only arrive when a value
// changes, so a field's latest row can be days old. One request for every field (see readingsBefore); if
// that fails, one small query per field. Telemetry is a bonus on top of the poll, so a failed query just
// means no stream.
export async function loadStream(owner: Owner, vin: string, fields: string[] = STREAM_FIELDS): Promise<Stream> {
  if (DEMO) return demoStream(fields);
  try {
    return await readingsBefore(owner, vin, fields, LATEST);
  } catch (err) {
    console.warn("Latest telemetry in one request unavailable, reading each field:", (err as Error).message);
  }
  const results = await Promise.all(
    fields.map(async (field) => {
      const { data, error } = await ownerDb(owner)
        .readings("created_at, value")
        .eq("vin", vin)
        .eq("field", field)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn(`Telemetry ${field} unavailable:`, error.message);
        return null;
      }
      return data ? ([field, { at: data.created_at as string, value: data.value as unknown }] as const) : null;
    }),
  );
  return Object.fromEntries(results.filter((r) => r !== null));
}

export const PAGE = 1000;
export const MAX_PAGES = 20;

// One field's readings in a time window, oldest first. PostgREST caps a response at 1000 rows, so this
// pages through with .range(), up to MAX_PAGES. Null when the query fails (telemetry is a bonus).
export async function loadReadings(owner: Owner, vin: string, field: string, from: string, to?: string): Promise<Reading[] | null> {
  if (DEMO) return demoReadings(field, from, to);
  const rows: Reading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = ownerDb(owner).readings("created_at, value").eq("vin", vin).eq("field", field).gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    const { data, error } = await query.order("created_at", { ascending: true }).range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) {
      console.warn(`Telemetry ${field} unavailable:`, error.message);
      return null;
    }
    rows.push(...(data ?? []).map((r) => ({ at: r.created_at as string, value: r.value as unknown })));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

// When one car last sent data: the newest of its presence fields (lib/awake.ts), which stream every few
// minutes while it's awake. One request, each field a step back on the index (readingsBefore), so it's
// cheap enough for every page's alerts bell. Null when it never sent any. Throws on a read error.
// Read once per request: the home page and the alerts bell both ask for the same car.
const lastReadingRequests = cache(() => new Map<string, Promise<string | null>>());

export function carLastReadingAt(owner: Owner, vin: string): Promise<string | null> {
  if (DEMO) return Promise.resolve(demoLastReadingAt());
  const requests = lastReadingRequests();
  const key = `${owner.userId}:${vin}`;
  let pending = requests.get(key);
  if (!pending) {
    pending = readLastReadingAt(owner, vin);
    requests.set(key, pending);
  }
  return pending;
}

async function readLastReadingAt(owner: Owner, vin: string): Promise<string | null> {
  const latest = await readingsBefore(owner, vin, PRESENCE_FIELDS, LATEST);
  const newest = Math.max(...Object.values(latest).map((r) => Date.parse(r.at)).filter((t) => !Number.isNaN(t)));
  return Number.isFinite(newest) ? new Date(newest).toISOString() : null;
}

// The car the owner's figures follow, from their cars oldest first: the first still on their Tesla account
// (readings_until is null), else the first with a VIN. So after selling one car and buying another on the
// same account, the new car takes over.
export function primaryCar<T extends { vin: string | null; readings_until?: string | null }>(cars: T[]): T | null {
  const withVin = cars.filter((c) => c.vin);
  return withVin.find((c) => !c.readings_until) ?? withVin[0] ?? null;
}

// The primary car (primaryCar), read once per page and handed to the loaders that need it.
export async function loadPrimaryVehicle(owner: Owner): Promise<{ id: string; vin: string } | null> {
  if (DEMO) return { id: demoData().vehicle.id, vin: demoData().vin };
  const { data, error } = await ownerDb(owner).from("vehicles").select("id:id::text, vin, readings_until").not("vin", "is", null).order("created_at");
  if (error) {
    console.warn("Vehicle VIN unavailable:", error.message);
    return null;
  }
  const car = primaryCar((data ?? []) as { id: string; vin: string; readings_until: string | null }[]);
  return car ? { id: car.id, vin: car.vin } : null;
}

// When the owner's newest streamed reading arrived, or null when there are none (or the query fails).
// Read by the owner's VINs, which the (vin, field, created_at) index serves, within the owner's window
// for each car (ownerDb readings).
export async function lastReadingAt(owner: Owner): Promise<string | null> {
  if (DEMO) return demoLastReadingAt();
  const scope = ownerDb(owner);
  const cars = await scope.from("vehicles").select("vin").not("vin", "is", null);
  if (cars.error) {
    console.warn("Last reading unavailable:", cars.error.message);
    return null;
  }
  const vins = (cars.data ?? []).map((c) => c.vin as string);
  if (vins.length === 0) return null;
  const { data, error } = await scope
    .readings("created_at")
    .in("vin", vins)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Last reading unavailable:", error.message);
    return null;
  }
  return (data?.created_at as string | undefined) ?? null;
}
