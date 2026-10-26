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
// Recheck a key Tesla hasn't confirmed at most every 10 minutes, and one it has once a day (a key can be
// removed from the car, but that's rare and the 6-hourly check notices too).
export const KEY_RECHECK_MS = 10 * MINUTE;
export const PAIRED_RECHECK_MS = 24 * 60 * MINUTE;
export const STREAMING_RECHECK_MS = 10 * MINUTE;
// Never send the same car its config twice within this, whatever Tesla says meanwhile.
export const RESEND_AFTER_MS = 60 * MINUTE;

const age = (at: string | null, now: number) => (at ? now - Date.parse(at) : Infinity);

export function keyStale(car: CarSetup, now: number): boolean {
  return age(car.keyCheckedAt, now) >= (car.keyPaired === true ? PAIRED_RECHECK_MS : KEY_RECHECK_MS);
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
// `synced` means the car runs the config it was sent. No config at all is "none". Null: not understood.
export function parseTelemetryConfig(body: unknown): Streaming | null {
  const response = (body as { response?: unknown } | null)?.response;
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  if (r.synced === true) return "synced";
  const config = r.config;
  if (config && typeof config === "object") return "pending";
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
// key. "unknown": Tesla's answer is missing for a car, so show the page with a small note.
export type Gate = "pass" | "setup" | "unknown";

export function gateFor(input: { demo: boolean; admin: boolean; cars: Pick<CarSetup, "keyPaired" | "keyCheckedAt">[] }): Gate {
  // Demo mode has no Tesla, and the admin is the owner whose car streams already.
  if (input.demo || input.admin) return "pass";
  if (input.cars.some((car) => car.keyPaired === false)) return "setup";
  // Asked, and Tesla's answer didn't say: a note, not a gate.
  if (input.cars.some((car) => car.keyPaired === null && car.keyCheckedAt !== null)) return "unknown";
  return "pass";
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
