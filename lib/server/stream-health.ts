import "server-only";
import tls from "node:tls";
import { DEMO } from "@/lib/demo";
import { demoData, demoLastReadingAt } from "./demo";
import { fleetLastReadingAt, fleetLastSeen, healthCheckCar, pingDatabase, recordHealthChecks } from "./data/system";
import { NotConnectedError } from "./tesla";
import { streamState, type TelemetryErrors } from "./tesla-stream-state";
import { currentErrors, daysUntilExpiry, EXPIRY_WARN_DAYS, shortReason, streamFreshness } from "@/lib/stream-health";
import { worstStatus, type Status } from "@/lib/status";

const RECEIVER_HOST = "telemetry.getuplink.in";
const CHECK_TIMEOUT_MS = 8000;
const RETENTION_DAYS = 120;

export const COMPONENTS = ["Website", "Database", "Live data receiver", "Car data stream"] as const;
export type ComponentName = (typeof COMPONENTS)[number];

// `problems` stay private: they go to the token-protected health route, never to the public page.
export type ComponentHealth = { name: ComponentName; status: Status; problems: string[] };

export type HealthChecks = {
  now: number;
  components: ComponentHealth[];
  lastReadingAt: string | null;
  carLastOnlineAt: string | null;
  synced: boolean | null;
  expiresAt: string | null;
  // When Tesla's streaming config and errors were last fetched (reused for up to an hour); null when not asked.
  teslaFetchedAt: string | null;
};

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Does the receiver answer a TLS handshake? Our own CA signs its certificate, so it isn't verified.
// A TLS alert asking for a client certificate also proves it is up: mutual TLS turns us away on purpose.
function receiverReachable(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: RECEIVER_HOST, port: 443, servername: RECEIVER_HOST, rejectUnauthorized: false });
    socket.setTimeout(CHECK_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error("Connecting timed out"));
    });
    socket.once("secureConnect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", (err: NodeJS.ErrnoException) => {
      socket.destroy();
      // Network failures have an errno code ("ECONNREFUSED"); a TLS alert from the server does not.
      if (err.code?.startsWith("E") && !err.code.startsWith("ERR_SSL")) reject(err);
      else if (/alert|certificate required|handshake failure/i.test(err.message)) resolve();
      else reject(err);
    });
  });
}


// A check's result: a status and the private problems behind it.
type Part = { status: Status; problems: string[] };
const ok: Part = { status: "operational", problems: [] };

async function checkDatabase(): Promise<Part> {
  try {
    const { error } = await withTimeout(pingDatabase(), "Reading the database");
    if (error) throw new Error(error.message);
    return ok;
  } catch (err) {
    return { status: "down", problems: [`Database not reachable: ${shortReason(err)}`] };
  }
}

async function checkReceiver(): Promise<Part> {
  try {
    await receiverReachable();
    return ok;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const down = code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNRESET";
    if (down || (err as Error).message.endsWith("timed out")) return { status: "down", problems: ["Receiver not reachable"] };
    return { status: "degraded", problems: [`Couldn't check the receiver: ${shortReason(err)}`] };
  }
}

type Stream = Part & { reading: string | null; online: string | null; synced: boolean | null; expiresAt: string | null; teslaFetchedAt: string | null };

// Readings stopped while the car was online = down. A config that is missing, unsynced, expiring or
// reporting errors, or a check that couldn't run = degraded.
async function checkStream(now: number): Promise<Stream> {
  const out: Stream = { status: "operational", problems: [], reading: null, online: null, synced: null, expiresAt: null, teslaFetchedAt: null };
  const flag = (status: Status, problem: string) => {
    out.status = worstStatus(out.status, status);
    out.problems.push(problem);
  };

  const freshness = async () => {
    try {
      const [last, seen] = await withTimeout(
        Promise.all([
          fleetLastReadingAt().catch((err) => {
            // Telemetry is a bonus: a failed read counts as no readings, as it always has.
            console.warn("Last reading unavailable:", (err as Error).message);
            return null;
          }),
          fleetLastSeen(),
        ]),
        "Reading the database",
      );
      if (seen.error) throw new Error(seen.error.message);
      out.reading = last;
      out.online = (seen.data?.last_seen_at as string | undefined) ?? null;
      const f = streamFreshness(out.reading, out.online, now);
      if (f.stale) flag("down", `No streamed data for ${f.hours} h while the car was online`);
    } catch (err) {
      flag("degraded", `Couldn't check stream freshness: ${shortReason(err)}`);
    }
  };

  let teslaErrors: NonNullable<TelemetryErrors>["fleet_telemetry_errors"] = [];
  const config = async () => {
    try {
      const car = await withTimeout(healthCheckCar(), "Reading the database");
      if (!car) {
        flag("degraded", "Couldn't check the Tesla config: no vehicle found");
        return;
      }
      const { vin } = car;
      // No account to ask with reads as disconnected, like a missing token.
      if (!car.owner) throw new NotConnectedError();
      const owner = car.owner;
      // Reused for up to an hour (see streamState): the rest of the checks stay live on every call.
      const state = await withTimeout(streamState(owner, vin, now), "Asking Tesla");
      const { config: cfg, errors: errs } = state;
      out.teslaFetchedAt = state.fetchedAt;
      if (!cfg || !cfg.config) {
        flag("degraded", "No streaming config on the car");
      } else {
        out.synced = typeof cfg.synced === "boolean" ? cfg.synced : null;
        if (out.synced === false) flag("degraded", "Tesla says the streaming config isn't synced");
        if (cfg.key_paired === false) flag("degraded", "Uplink's key isn't paired with the car");
        const exp = cfg.config.exp;
        if (typeof exp === "number") out.expiresAt = new Date(exp * 1000).toISOString();
        const days = daysUntilExpiry(exp, now);
        if (days !== null && days < EXPIRY_WARN_DAYS) {
          flag("degraded", days < 0 ? "Streaming config has expired" : `Streaming config expires in ${days} days`);
        }
      }
      teslaErrors = errs?.fleet_telemetry_errors ?? [];
    } catch (err) {
      if (err instanceof NotConnectedError) flag("degraded", "Tesla account disconnected");
      else flag("degraded", `Couldn't check the Tesla config: ${shortReason(err)}`);
    }
  };

  await Promise.all([freshness(), config()]);
  // Tesla keeps an error in its list long after the stream recovers, so one only counts while no reading
  // has arrived since it (see currentErrors).
  const current = currentErrors(teslaErrors, out.reading);
  if (current.length) flag("degraded", `Tesla reported a stream error (${current.slice(0, 2).join(", ")}) and no data has arrived since`);
  return out;
}

// Runs every check once. Shared by the token-protected health route and the status page's history.
export async function runHealthChecks(): Promise<HealthChecks> {
  const now = Date.now();
  if (DEMO) {
    // No network or database in demo mode: everything is up.
    const { vehicle } = demoData();
    return {
      now,
      components: COMPONENTS.map((name) => ({ name, ...ok })),
      lastReadingAt: demoLastReadingAt(),
      carLastOnlineAt: vehicle.last_seen_at,
      synced: true,
      expiresAt: new Date(now + 60 * 86_400_000).toISOString(),
      teslaFetchedAt: new Date(now).toISOString(),
    };
  }
  const [database, receiver, stream] = await Promise.all([checkDatabase(), checkReceiver(), checkStream(now)]);
  return {
    now,
    components: [
      { name: "Website", ...ok }, // if this code runs, the website is up
      { name: "Database", ...database },
      { name: "Live data receiver", ...receiver },
      { name: "Car data stream", status: stream.status, problems: stream.problems },
    ],
    lastReadingAt: stream.reading,
    carLastOnlineAt: stream.online,
    synced: stream.synced,
    expiresAt: stream.expiresAt,
    teslaFetchedAt: stream.teslaFetchedAt,
  };
}

// Stores one row per component and drops rows past the retention window. Throws on a database error.
export async function recordResults(checks: HealthChecks): Promise<void> {
  if (DEMO) return;
  const checkedAt = new Date(checks.now).toISOString();
  const cutoff = new Date(checks.now - RETENTION_DAYS * 86_400_000).toISOString();
  await recordHealthChecks(
    checkedAt,
    checks.components.map((c) => ({ component: c.name, status: c.status, problems: c.problems })),
    COMPONENTS,
    cutoff,
  );
}

// Runs the checks and records them.
export async function recordHealth(): Promise<HealthChecks> {
  const checks = await runHealthChecks();
  await recordResults(checks);
  return checks;
}
