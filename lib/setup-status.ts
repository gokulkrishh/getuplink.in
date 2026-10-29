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
  // When the car's config runs out, from the read of it in this same pass (lib/server/setup.ts
  // refreshStreaming). Left out when not read: the stored copy is the bell's (lib/server/alerts.ts).
  configExpiresAt?: string | null;
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
// Renew a car's config this many days before it runs out (it lasts TELEMETRY_EXP_DAYS, 360). A synced car's
// config is read once a day (streamingStale), so this gives about 30 tries, each at least RESEND_AFTER_MS
// apart, before the bell warns at EXPIRY_WARN_DAYS (14): room for a car parked asleep for a couple of weeks
// to wake and take it. It costs one extra send per car a year.
export const RENEW_WITHIN_DAYS = 30;

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

// When the car's streaming config runs out: the same answer's config.exp (unix seconds). After it the car
// stops sending data to Uplink. Null without a config or an exp.
export function parseConfigExpiry(body: unknown): string | null {
  const response = (body as { response?: unknown } | null)?.response;
  const config = response && typeof response === "object" ? (response as { config?: unknown }).config : null;
  const exp = config && typeof config === "object" ? (config as { exp?: unknown }).exp : null;
  return typeof exp === "number" && Number.isFinite(exp) ? new Date(exp * 1000).toISOString() : null;
}

// What to store as a car's config expiry from the same answer: the exp; null when Tesla says the car has no
// config from Uplink ("none" or "full"); undefined (keep what's stored) when the answer isn't understood or
// a config's exp can't be read, so a known expiry is never wiped by a partial answer.
export function expiryToRecord(body: unknown): string | null | undefined {
  const streaming = parseTelemetryConfig(body);
  if (streaming === "none" || streaming === "full") return null;
  if (streaming === null) return undefined;
  return parseConfigExpiry(body) ?? undefined;
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

// Whether Uplink should send this car its streaming config now: its key is on, it wasn't just sent one,
// and Tesla says it has no config from Uplink, or has one (synced or not) that runs out within
// RENEW_WITHIN_DAYS. A config whose expiry wasn't read is never replaced.
// One renewal per window: once one went in it, none other, since Tesla may answer the config read with the
// old exp until the car takes the new one (and the car may sleep for days).
export function shouldSendConfig(car: CarSetup, now: number): boolean {
  if (car.keyPaired !== true || age(car.configSentAt, now) < RESEND_AFTER_MS) return false;
  if (car.streaming === "none") return true;
  const expiresAt = car.configExpiresAt ?? null;
  return (car.streaming === "synced" || car.streaming === "pending") && renewDue(expiresAt, now) && !renewalSent(car.configSentAt, expiresAt);
}

const RENEW_WITHIN_MS = RENEW_WITHIN_DAYS * 24 * 60 * MINUTE;

export function renewDue(expiresAt: string | null, now: number): boolean {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isNaN(at) && at - now < RENEW_WITHIN_MS;
}

// Whether Uplink already sent a renewal for a config running out at `expiresAt`: a send inside its window.
// The bell's warning reads it too (lib/alerts.ts): sent and not taken, the car has to wake.
export function renewalSent(sentAt: string | null, expiresAt: string | null): boolean {
  const sent = sentAt ? Date.parse(sentAt) : NaN;
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isNaN(sent) && !Number.isNaN(at) && sent >= at - RENEW_WITHIN_MS;
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

// Each car's newest reading by VIN: null for none yet, undefined (or absent) when it couldn't be read.
export type LastReadings = Record<string, string | null | undefined>;

// Whether a car's step says Live: only a read that found no reading says Ready. A failed read is unknown
// and keeps the Live wording, so a database hiccup never turns a streaming car back into "Ready".
export function carLive(vin: string, last: LastReadings): boolean {
  return last[vin] !== null;
}

// Whether the streaming step says Live: its config is on (the step is done) and some car has sent data
// (or that isn't known). Until the first reading the step says Ready.
export function streamingLive(cars: CarSetup[], last: LastReadings): boolean {
  return streamingStep(cars) === "done" && cars.some((car) => carLive(car.vin, last));
}
