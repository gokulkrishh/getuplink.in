import tls from "node:tls";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/session";
import { db } from "@/lib/server/supabase";
import { lastReadingAt } from "@/lib/server/telemetry";
import { fleetGet, NotConnectedError } from "@/lib/server/tesla";
import { assembleHealth, daysUntilExpiry, EXPIRY_WARN_DAYS, shortReason, streamFreshness } from "@/lib/stream-health";

export const maxDuration = 30;

const RECEIVER_HOST = "telemetry.getuplink.in";
const CHECK_TIMEOUT_MS = 8000;

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

type TelemetryConfig = { synced?: boolean; key_paired?: boolean; config?: { exp?: number } | null } | null;
type TelemetryErrors = { fleet_telemetry_errors?: { name?: string; error?: string }[] } | null;

// Called by an external bot every 15 minutes with `Authorization: Bearer $HEALTH_TOKEN`. Always 200
// once authorised: the bot reads `ok`. Nothing here returns a VIN, token or secret.
export async function GET(request: NextRequest) {
  const token = process.env.HEALTH_TOKEN;
  if (!token) return NextResponse.json({ error: "HEALTH_TOKEN not set" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const problems: string[] = [];
  let reading: string | null = null;
  let online: string | null = null;
  let synced: boolean | null = null;
  let expiresAt: string | null = null;

  const receiver = async () => {
    try {
      await receiverReachable();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const down = code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNRESET";
      problems.push(down || (err as Error).message.endsWith("timed out") ? "Receiver not reachable" : `Couldn't check the receiver: ${shortReason(err)}`);
    }
  };

  const freshness = async () => {
    try {
      const [last, seen] = await withTimeout(
        Promise.all([
          lastReadingAt(),
          db().from("vehicles").select("last_seen_at").not("last_seen_at", "is", null).order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
        ]),
        "Reading the database",
      );
      if (seen.error) throw new Error(seen.error.message);
      reading = last;
      online = (seen.data?.last_seen_at as string | undefined) ?? null;
      const f = streamFreshness(reading, online, now);
      if (f.stale) problems.push(`No streamed data for ${f.hours} h while the car was online`);
    } catch (err) {
      problems.push(`Couldn't check stream freshness: ${shortReason(err)}`);
    }
  };

  const config = async () => {
    try {
      const { data, error } = await withTimeout(db().from("vehicles").select("vin").not("vin", "is", null).limit(1).maybeSingle(), "Reading the database");
      if (error) throw new Error(error.message);
      const vin = data?.vin as string | undefined;
      if (!vin) {
        problems.push("Couldn't check the Tesla config: no vehicle found");
        return;
      }
      const [cfg, errs] = await withTimeout(
        Promise.all([
          fleetGet<TelemetryConfig>(`/api/1/vehicles/${vin}/fleet_telemetry_config`),
          fleetGet<TelemetryErrors>(`/api/1/vehicles/${vin}/fleet_telemetry_errors`).catch((): TelemetryErrors => null),
        ]),
        "Asking Tesla",
      );
      if (!cfg || !cfg.config) {
        problems.push("No streaming config on the car");
      } else {
        synced = typeof cfg.synced === "boolean" ? cfg.synced : null;
        if (synced === false) problems.push("Tesla says the streaming config isn't synced");
        if (cfg.key_paired === false) problems.push("Uplink's key isn't paired with the car");
        const exp = cfg.config.exp;
        if (typeof exp === "number") expiresAt = new Date(exp * 1000).toISOString();
        const days = daysUntilExpiry(exp, now);
        if (days !== null && days < EXPIRY_WARN_DAYS) {
          problems.push(days < 0 ? "Streaming config has expired" : `Streaming config expires in ${days} days`);
        }
      }
      const names = [...new Set((errs?.fleet_telemetry_errors ?? []).map((e) => e.name || e.error).filter(Boolean))];
      if (names.length) problems.push(`Tesla reports errors: ${names.slice(0, 2).join(", ")}`);
    } catch (err) {
      if (err instanceof NotConnectedError) problems.push("Tesla account disconnected");
      else problems.push(`Couldn't check the Tesla config: ${shortReason(err)}`);
    }
  };

  await Promise.all([receiver(), freshness(), config()]);
  return NextResponse.json(assembleHealth({ now, problems, lastReadingAt: reading, carLastOnlineAt: online, synced, expiresAt }));
}
