import "server-only";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import {
  type CarSetup,
  type Gate,
  gateFor,
  keyStale,
  expiryToRecord,
  parseConfigSent,
  parseFleetStatus,
  parseTelemetryConfig,
  shouldSendConfig,
  signInPath,
  skipReason,
  type Streaming,
  streamingStale,
} from "@/lib/setup-status";
import type { Owner } from "./data/owner";
import { carSetups, carsWithoutSetup, markConfigSent, saveConfigExpiry, saveKeyStatus, saveStreaming, saveStreamingIfNewer, SetupSchemaMissing } from "./data/setup";
import { lastReadingAt } from "./telemetry";
import { canSendConfig, signedTelemetryConfig } from "./telemetry-config";
import { fleetGetBody, fleetPost, hasScope, LOCATION_SCOPE, NotConnectedError } from "./tesla";

// A new owner's setup (app/setup): Uplink's virtual key on each car, then each car streaming to Uplink.
// Tesla is asked as rarely as the answers allow (lib/setup-status.ts has the intervals):
//   the gate (components/header.tsx, every signed-in page) only reads what's stored, and asks Tesla's
//     fleet_status, one request for all the owner's cars, when the stored answer is old;
//   /setup, its "Check again" and the 6-hourly check also read each car's streaming config, and send it
//     Uplink's config once the key is on and it has none.
// Every request goes through lib/server/tesla.ts, so it is counted in api_usage.

// Where answers are kept: the vehicles row, or nowhere before the migration.
type Store = {
  saveKey(vin: string, paired: boolean | null, at: string): Promise<void>;
  saveStreaming(vin: string, streaming: Streaming | null, at: string): Promise<void>;
  markSent(vin: string, at: string): Promise<void>;
  // When the car's config runs out; never throws (the column may not exist yet, see recordConfigExpiry).
  saveExpiry(vin: string, expiresAt: string | null): Promise<void>;
  persistent: boolean;
};

const rowStore = (owner: Owner): Store => ({
  saveKey: (vin, paired, at) => saveKeyStatus(owner, vin, paired, at),
  saveStreaming: (vin, streaming, at) => saveStreaming(owner, vin, streaming, at),
  markSent: (vin, at) => markConfigSent(owner, vin, at),
  saveExpiry: (vin, expiresAt) => recordConfigExpiry(owner, vin, expiresAt),
  persistent: true,
});

const NO_STORE: Store = { saveKey: async () => {}, saveStreaming: async () => {}, markSent: async () => {}, saveExpiry: async () => {}, persistent: false };

// The owner's cars and where their answers go.
async function load(owner: Owner): Promise<{ cars: CarSetup[]; store: Store }> {
  try {
    return { cars: await carSetups(owner), store: rowStore(owner) };
  } catch (err) {
    if (!(err instanceof SetupSchemaMissing)) throw err;
    return { cars: await carsWithoutSetup(owner), store: NO_STORE };
  }
}

// Asks fleet_status about these cars. A Tesla error or an answer that doesn't name a car leaves it unknown
// (null), stored with the time so it isn't asked again at once; unknown never gates.
async function refreshKeys(owner: Owner, cars: CarSetup[], store: Store, now: number): Promise<void> {
  if (cars.length === 0) return;
  const at = new Date(now).toISOString();
  let paired: Map<string, boolean | null>;
  try {
    paired = parseFleetStatus(await fleetPost(owner, "/api/1/vehicles/fleet_status", { vins: cars.map((c) => c.vin) }), cars.map((c) => c.vin));
  } catch (err) {
    if (err instanceof NotConnectedError) return;
    console.warn("Checking Uplink's key with Tesla failed:", messageOf(err));
    paired = new Map();
  }
  for (const car of cars) {
    const was = car.keyPaired;
    car.keyPaired = paired.get(car.vin) ?? null;
    car.keyCheckedAt = at;
    // A key just added back: the car may have lost its streaming config with the key, so whatever was said
    // about streaming before is asked again in this same pass (loadSetup, checkSetup).
    if (was === false && car.keyPaired === true) car.streamingCheckedAt = null;
    await store.saveKey(car.vin, car.keyPaired, at);
  }
}

// Each car with the key: its streaming config, and Uplink's config sent when it has none or when its
// config runs out within RENEW_WITHIN_DAYS. A renewal Tesla takes waits for the car like a first one
// ("pending", read again within STREAMING_RECHECK_MS), and that read brings the new expiry.
async function refreshStreaming(owner: Owner, cars: CarSetup[], store: Store, now: number): Promise<void> {
  const at = new Date(now).toISOString();
  await Promise.all(
    cars
      .filter((car) => car.keyPaired === true)
      .map(async (car) => {
        let streaming: Streaming | null = null;
        let body: unknown;
        try {
          body = await fleetGetBody(owner, `/api/1/vehicles/${encodeURIComponent(car.vin)}/fleet_telemetry_config`);
          streaming = parseTelemetryConfig(body);
        } catch (err) {
          if (err instanceof NotConnectedError) return;
          console.warn("Reading a car's streaming config failed:", messageOf(err));
        }
        car.streaming = streaming;
        car.streamingCheckedAt = at;
        await store.saveStreaming(car.vin, streaming, at);
        // From the same answer: null without a config; an answer not understood, or a config whose exp
        // can't be read, leaves the stored expiry (expiryToRecord).
        // Kept on the car too, so a config running out is renewed below (shouldSendConfig).
        const expiry = expiryToRecord(body);
        if (expiry !== undefined) {
          car.configExpiresAt = expiry;
          await store.saveExpiry(car.vin, expiry);
        }
      }),
  );
  // Only where the send can be remembered: without the columns, every page view could send again.
  if (!store.persistent || !canSendConfig()) return;
  const due = cars.filter((car) => shouldSendConfig(car, now));
  if (due.length === 0) return;
  // The config streams Location and other fields Tesla allows only with vehicle_location; without the
  // scope Tesla would refuse it, so nothing is sent and /setup asks the owner to sign in again.
  if (!(await hasScope(owner, LOCATION_SCOPE).catch(() => false))) return;
  let body: ReturnType<typeof signedTelemetryConfig>;
  try {
    body = signedTelemetryConfig(due.map((c) => c.vin), now);
  } catch (err) {
    // Missing or mismatched keys: nothing reaches Tesla, and nothing is marked sent. The message names the
    // env var at most, never key material.
    console.warn("Signing the streaming config failed:", messageOf(err));
    return;
  }
  // Marked before sending: a send that fails or times out still waits an hour before the next.
  for (const car of due) {
    car.configSentAt = at;
    await store.markSent(car.vin, at);
  }
  try {
    const answer = parseConfigSent(await fleetPost(owner, "/api/1/vehicles/fleet_telemetry_config_jws", body));
    for (const car of due) {
      const reason = answer ? skipReason(answer, car.vin) : null;
      if (reason === "missing_key") {
        car.keyPaired = false;
        await store.saveKey(car.vin, false, at);
      } else if (reason === "max_configs") {
        car.streaming = "full";
        await store.saveStreaming(car.vin, "full", at);
      } else if (answer && !reason) {
        // Taken: the car picks it up next time it's online.
        car.streaming = "pending";
        await store.saveStreaming(car.vin, "pending", at);
      } else if (reason) {
        console.warn(`Tesla didn't take a car's streaming config: ${reason}`);
      }
    }
  } catch (err) {
    // Tesla's answer carries no key, and the signed token isn't secret (vehicle-command's tesla-jws README).
    console.warn("Sending the streaming config failed:", messageOf(err));
  }
}

// One refresh of each kind per user at a time in this instance: the header's prefetches open several
// pages at once, and each would otherwise ask Tesla the same thing.
const inflight = new Map<string, Promise<unknown>>();

function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = inflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const promise = work().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// Whether this signed-in page should send the owner to /setup. `admin`: the session is the admin's (the
// owner, whose car streams already), who is never sent there. Never throws: a failure shows the page.
export async function setupGate(owner: Owner, { admin = false, now = Date.now() }: { admin?: boolean; now?: number } = {}): Promise<Gate> {
  if (DEMO) return "pass";
  try {
    // The admin's pages never wait on Tesla: only what's stored, which the health check keeps current
    // (recordKeyStatus), so a key removed from the car shows within the half hour.
    if (admin) return gateFor({ demo: false, admin: true, cars: (await load(owner)).cars });
    const cars = await once(`gate:${owner.userId}`, async () => {
      const { cars, store } = await load(owner);
      // Before the migration nothing can be kept, so nothing is asked and nobody is sent to /setup.
      if (!store.persistent) return [];
      // A paired key checked over an hour ago is rechecked when the cars have also gone quiet (keyStale):
      // the newest reading is read only then, so most page views add no query.
      const mightBeSilent = cars.some((car) => car.keyPaired === true && !keyStale(car, now) && keyStale(car, now, null));
      const last = mightBeSilent ? await lastReadingAt(owner) : null;
      const since = mightBeSilent ? (last ? Date.parse(last) : null) : undefined;
      await refreshKeys(owner, cars.filter((car) => keyStale(car, now, since)), store, now);
      return cars;
    });
    return gateFor({ demo: false, admin: false, cars });
  } catch (err) {
    console.warn("Reading setup status failed:", messageOf(err));
    return "pass";
  }
}

// What Tesla just said about Uplink's key on a car, from the health check (lib/server/stream-health.ts),
// kept on the car's row as /setup keeps it. A key removed from the car stops it sending data, and this is
// how the owner hears of it within the half hour instead of at the daily recheck. `at` is when Tesla said
// it, which can be up to an hour ago: an answer /setup got since then stands (saveKeyStatus). Never throws:
// the health check carries on without it.
export async function recordKeyStatus(owner: Owner, vin: string, paired: boolean, at: string): Promise<void> {
  if (DEMO) return;
  try {
    await saveKeyStatus(owner, vin, paired, at);
  } catch (err) {
    if (!(err instanceof SetupSchemaMissing)) console.warn("Saving the key status failed:", messageOf(err));
  }
}

// What the health check just heard about a car's config when it differs from the row (streamingToRecord):
// a config lost from the car shows as "none", which /setup and the 6-hourly check reread within 10 minutes
// (streamingStale) and send again, instead of waiting a day on a stale "synced". `at` is when Tesla said it;
// a newer answer from /setup stands. Never throws: the health check carries on without it.
export async function recordStreaming(owner: Owner, vin: string, streaming: Streaming, at: string): Promise<void> {
  if (DEMO) return;
  try {
    await saveStreamingIfNewer(owner, vin, streaming, at);
  } catch (err) {
    if (!(err instanceof SetupSchemaMissing)) console.warn("Saving the streaming state failed:", messageOf(err));
  }
}

// When a car's streaming config runs out, from /setup's read of it or the health check's (`olderThan`: when
// Tesla gave that answer, kept only when /setup hasn't read the config since; see saveConfigExpiry). The
// bell warns before it (lib/alerts.ts). Never throws: before 20261113120000_config_expiry.sql there's
// nowhere to keep it, and the warning is simply missing.
export async function recordConfigExpiry(owner: Owner, vin: string, expiresAt: string | null, olderThan?: string): Promise<void> {
  if (DEMO) return;
  try {
    await saveConfigExpiry(owner, vin, expiresAt, olderThan);
  } catch (err) {
    if (!(err instanceof SetupSchemaMissing)) console.warn("Saving the config expiry failed:", messageOf(err));
  }
}

// Where a sign-in lands (signInPath), from what's stored: Tesla isn't asked here, so sign-in isn't held up.
// Demo mode, a missing migration and a failed read land on home, as the gate passes them.
export async function afterSignInPath(owner: Owner): Promise<"/" | "/setup"> {
  if (DEMO) return "/";
  try {
    return signInPath(await carSetups(owner));
  } catch (err) {
    if (!(err instanceof SetupSchemaMissing)) console.warn("Reading setup status failed:", messageOf(err));
    return "/";
  }
}

// needsLocation: the owner's sign-in didn't allow location, so Uplink can't send the streaming config.
export type SetupView = { cars: CarSetup[]; canSend: boolean; needsLocation: boolean; checkedAt: string | null };

// Force: "Check again", at most every FORCE_MS per user so the button can't run up requests.
const FORCE_MS = 30_000;

// /setup: every car with both steps, asking Tesla what's old (or everything, when forced).
export async function loadSetup(owner: Owner, { force = false, now = Date.now() }: { force?: boolean; now?: number } = {}): Promise<SetupView> {
  const recent = (at: string | null) => at !== null && now - Date.parse(at) < FORCE_MS;
  const cars = await once(`full:${owner.userId}`, async () => {
    const { cars, store } = await load(owner);
    // Before the migration nothing is stored, so every car is asked each time.
    const due = (at: string | null, stale: boolean) => !store.persistent || (force ? !recent(at) : stale);
    await refreshKeys(owner, cars.filter((car) => due(car.keyCheckedAt, keyStale(car, now))), store, now);
    await refreshStreaming(owner, cars.filter((car) => due(car.streamingCheckedAt, streamingStale(car, now))), store, now);
    return cars;
  });
  const times = cars.flatMap((c) => [c.keyCheckedAt, c.streamingCheckedAt]).filter((t): t is string => t !== null);
  const needsLocation = !(await hasScope(owner, LOCATION_SCOPE).catch(() => false));
  return { cars, canSend: canSendConfig(), needsLocation, checkedAt: times.sort().at(-1) ?? null };
}

// The 6-hourly check: whatever is old, so a car paired while nobody had /setup open still gets its config.
// Never fails the check.
export async function checkSetup(owner: Owner, now: number = Date.now()): Promise<void> {
  if (DEMO) return;
  try {
    await once(`full:${owner.userId}`, async () => {
      const { cars, store } = await load(owner);
      if (!store.persistent) return cars;
      await refreshKeys(owner, cars.filter((car) => keyStale(car, now)), store, now);
      await refreshStreaming(owner, cars.filter((car) => streamingStale(car, now)), store, now);
      return cars;
    });
  } catch (err) {
    console.warn("Checking setup failed:", messageOf(err));
  }
}
