// A new owner's two setup steps, as plain data and rules: Uplink's virtual key on each car, then the car
// streaming to Uplink. Read from Tesla by lib/server/setup.ts; tested in test/setup-status.test.ts.

export const KEY_PAIRING_URL = "https://tesla.com/_ak/app.getuplink.in";

// Tesla's answers, as stored on each vehicles row. Null is unknown: not asked yet, or Tesla didn't say.
export type Streaming = "synced" | "pending" | "none" | "full";

export type CarSetup = {
  vin: string;
  name: string | null;
  keyPaired: boolean | null;
  keyCheckedAt: string | null;
  streaming: Streaming | null;
  streamingCheckedAt: string | null;
  configSentAt: string | null;
};

const MINUTE = 60_000;
// Recheck a key Tesla hasn't confirmed at most every 10 minutes, and one it has once a day. A key removed
// from the car stops it sending data, so a paired key is rechecked sooner, after SILENT_RECHECK_MS, while
// the owner's cars have sent nothing for that long: a car that's sending data plainly still has the key,
// and costs nothing.
export const KEY_RECHECK_MS = 10 * MINUTE;
export const PAIRED_RECHECK_MS = 24 * 60 * MINUTE;
export const SILENT_RECHECK_MS = 60 * MINUTE;
export const STREAMING_RECHECK_MS = 10 * MINUTE;
// Never send the same car its config twice within this, whatever Tesla says meanwhile.
export const RESEND_AFTER_MS = 60 * MINUTE;

const age = (at: string | null, now: number) => (at ? now - Date.parse(at) : Infinity);

// `lastReadingAt`: when the owner's cars last sent data (ms), null for never; left out, silence isn't weighed.
export function keyStale(car: CarSetup, now: number, lastReadingAt?: number | null): boolean {
  const checked = age(car.keyCheckedAt, now);
  if (car.keyPaired !== true) return checked >= KEY_RECHECK_MS;
  if (checked >= PAIRED_RECHECK_MS) return true;
  return lastReadingAt !== undefined && checked >= SILENT_RECHECK_MS && (lastReadingAt === null || now - lastReadingAt >= SILENT_RECHECK_MS);
}

export function streamingStale(car: CarSetup, now: number): boolean {
  return age(car.streamingCheckedAt, now) >= (car.streaming === "synced" ? PAIRED_RECHECK_MS : STREAMING_RECHECK_MS);
}

// ---- Tesla's answers ----

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

// POST /api/1/vehicles/fleet_status answers {response: {key_paired_vins, unpaired_vins, vehicle_info}}.
// A VIN is paired or unpaired only when Tesla lists it so; one in neither list, or any answer of another
// shape, is unknown (null), and unknown never sends anyone to /setup.
export function parseFleetStatus(body: unknown, vins: string[]): Map<string, boolean | null> {
  const response = (body as { response?: unknown } | null)?.response;
  const r = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const paired = new Set(strings(r.key_paired_vins));
  const unpaired = new Set(strings(r.unpaired_vins));
  return new Map(vins.map((vin) => [vin, paired.has(vin) ? true : unpaired.has(vin) ? false : null]));
}

// GET /api/1/vehicles/{vin}/fleet_telemetry_config answers {response: {synced, config, limit_reached, ...}}:
// `synced` means the car runs the config it was sent, but only with a config: a car whose key was removed and
// added back answers synced with config null, and has none. No config at all is "none". Null: not understood.
export function parseTelemetryConfig(body: unknown): Streaming | null {
  const response = (body as { response?: unknown } | null)?.response;
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const config = r.config;
  if (config && typeof config === "object") return r.synced === true ? "synced" : "pending";
  if (r.limit_reached === true) return "full";
  // Only an answer that says so is "none" (an empty one is unknown): "none" is what lets Uplink send a config.
  if (config === null || (r.synced === false && config === undefined)) return "none";
  return null;
}

// POST /api/1/vehicles/fleet_telemetry_config_jws answers {response: {updated_vehicles, skipped_vehicles:
// {missing_key: [...], unsupported_hardware: [...], unsupported_firmware: [...], max_configs: [...]}}}.
export type ConfigSent = { updated: number; skipped: Record<string, string[]> };

export function parseConfigSent(body: unknown): ConfigSent | null {
  const response = (body as { response?: unknown } | null)?.response;
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const skippedRaw = r.skipped_vehicles && typeof r.skipped_vehicles === "object" ? (r.skipped_vehicles as Record<string, unknown>) : {};
  const skipped = Object.fromEntries(Object.entries(skippedRaw).map(([why, list]) => [why, strings(list)]).filter(([, list]) => list.length > 0));
  return { updated: typeof r.updated_vehicles === "number" ? r.updated_vehicles : 0, skipped };
}

// The car's reason Tesla gave for not taking the config, if any.
export function skipReason(sent: ConfigSent, vin: string): string | null {
  return Object.entries(sent.skipped).find(([, list]) => list.includes(vin))?.[0] ?? null;
}

// Whether Uplink should send this car its streaming config now: its key is on, Tesla says it has no
// config from Uplink (never a car that has one, synced or not), and it wasn't just sent one.
export function shouldSendConfig(car: CarSetup, now: number): boolean {
  return car.keyPaired === true && car.streaming === "none" && age(car.configSentAt, now) >= RESEND_AFTER_MS;
}

// ---- The gate ----

// "pass": show the page. "setup": send the user to /setup, only when Tesla said a car of theirs lacks the
// key. "unknown": Tesla's answer is missing for a car, so show the page with a small note. "key-removed":
// the admin's car lost Uplink's key (removed on the car or in the Tesla app), so it stopped sending data;
// the page shows with a note pointing to /setup, since the admin is never sent there.
export type Gate = "pass" | "setup" | "unknown" | "key-removed";

export function gateFor(input: { demo: boolean; admin: boolean; cars: Pick<CarSetup, "keyPaired" | "keyCheckedAt">[] }): Gate {
  // Demo mode has no Tesla. The admin is the owner whose car streams already, so is never sent to /setup,
  // but is told when Tesla says the key is gone: nothing else would say why the data stopped.
  if (input.demo) return "pass";
  if (input.admin) return input.cars.some((car) => car.keyPaired === false) ? "key-removed" : "pass";
  if (input.cars.some((car) => car.keyPaired === false)) return "setup";
  // Asked, and Tesla's answer didn't say: a note, not a gate.
  if (input.cars.some((car) => car.keyPaired === null && car.keyCheckedAt !== null)) return "unknown";
  return "pass";
}

// Where a sign-in lands: home once Tesla has said every car has Uplink's key, /setup otherwise. A first
// sign-in has no cars stored yet (the first check runs after the redirect), so it lands on /setup.
export function signInPath(cars: Pick<CarSetup, "keyPaired">[]): "/" | "/setup" {
  return cars.length > 0 && cars.every((car) => car.keyPaired === true) ? "/" : "/setup";
}

// The two steps, as /setup shows them.
export type StepState = "done" | "todo" | "waiting" | "unknown";

export function keyStep(cars: CarSetup[]): StepState {
  if (cars.length === 0) return "unknown";
  if (cars.every((c) => c.keyPaired === true)) return "done";
  if (cars.some((c) => c.keyPaired === false)) return "todo";
  return "unknown";
}

export function streamingStep(cars: CarSetup[]): StepState {
  if (cars.length === 0) return "unknown";
  if (cars.every((c) => c.streaming === "synced")) return "done";
  if (cars.some((c) => c.keyPaired !== true)) return "waiting";
  if (cars.some((c) => c.streaming === null)) return "unknown";
  return "waiting";
}
