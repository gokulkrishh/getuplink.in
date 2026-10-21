// Supervises Tesla's fleet-telemetry server and copies its decoded "V" records into Supabase.
// The server runs with the `logger` dispatcher, which prints one JSON log line per record to
// stdout/stderr:
//   {"msg":"record_payload","vin":"...","data":{"Vin":"...","CreatedAt":"2026-...Z","IsResend":false,"Soc":71.2,...}, ...}
// We keep only record_payload lines, only allow-listed fields (never location), batch them and
// POST to PostgREST. Logs carry counts only, VINs as last 4 characters.

import { mkdirSync, writeFileSync } from "node:fs";

const CERT_DIR = "/tmp/certs";
const SERVER_BIN = process.env.FLEET_TELEMETRY_BIN ?? "/usr/local/bin/fleet-telemetry";
const CONFIG_PATH = process.env.FLEET_TELEMETRY_CONFIG ?? "/app/config.json";
const FLUSH_MS = 10_000;
const MAX_BATCH = 500;
const MAX_BUFFER = 20_000;
const RETRIES = 5;
const TRIM_TO = Math.floor(MAX_BUFFER * 0.9); // trim with headroom so an overflow logs once, not per line
const SHUTDOWN_CHILD_MS = 3_000;
const SHUTDOWN_FLUSH_MS = 8_000;
const HEARTBEAT_MS = 10 * 60_000;

// Must match the fields pushed by scripts/telemetry-config.mjs. Anything else is dropped.
const ALLOWED_FIELDS = new Set([
  "DetailedChargeState",
  "FastChargerPresent",
  "FastChargerType",
  "ACChargingPower",
  "DCChargingPower",
  "ACChargingEnergyIn",
  "DCChargingEnergyIn",
  "ChargeLimitSoc",
  "Soc",
  "BatteryLevel",
  "RatedRange",
  "EnergyRemaining",
  "Odometer",
  "Gear",
  "SelfDrivingMilesSinceReset",
  "Version",
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
  "SoftwareUpdateScheduledStartTime",
  "LifetimeEnergyUsed",
  "LifetimeEnergyGainedRegen",
  "TimeToFullCharge",
  "EstimatedHoursToChargeTermination",
  "ChargerVoltage",
  "ChargeAmps",
  "ChargerPhases",
  "ChargingCableType",
  "ModuleTempMax",
  "ModuleTempMin",
]);

type Row = { vin: string; created_at: string; field: string; value: unknown };

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const TABLE_URL = `${SUPABASE_URL}/rest/v1/telemetry_readings`;

// Secrets arrive as env vars (PEM); the server wants files.
mkdirSync(CERT_DIR, { recursive: true, mode: 0o700 });
writeFileSync(`${CERT_DIR}/tls.crt`, need("TLS_SERVER_CERT"), { mode: 0o600 });
writeFileSync(`${CERT_DIR}/tls.key`, need("TLS_SERVER_KEY"), { mode: 0o600 });

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const maskVin = (s: string) => s.replace(VIN_RE, (v) => `*${v.slice(-4)}`);
const tail4 = (vin: string) => `*${vin.slice(-4)}`;

let buffer: Row[] = [];
let seenLines = 0;
let acceptedRows = 0;
let writtenRows = 0;
let droppedRows = 0;
let rejectedRows = 0;
let badLines = 0;
let errorRecords = 0;
const vinsSeen = new Set<string>();

// Postgres jsonb/text refuse \u0000, which would make PostgREST reject the whole batch.
function clean<T>(v: T): T {
  if (typeof v === "string") return v.replaceAll("\u0000", "") as T;
  if (Array.isArray(v)) return v.map(clean) as T;
  if (typeof v === "object" && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[clean(k)] = clean(x);
    return out as T;
  }
  return v;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function handleLine(line: string) {
  if (!line.trim()) return;
  seenLines++;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    // Not JSON (startup banner etc.): pass through, VINs masked.
    console.log(`server: ${maskVin(line).slice(0, 300)}`);
    return;
  }
  if (!isObject(obj)) return;

  if (obj.msg !== "record_payload") {
    // Server messages (errors, TLS handshake failures, ...). Only the message text, masked.
    const level = typeof obj.level === "string" ? obj.level : "info";
    if (level !== "info" && level !== "debug") {
      const msg = typeof obj.msg === "string" ? obj.msg : "";
      const err = typeof obj.error === "string" ? ` ${obj.error}` : "";
      console.log(`server ${level}: ${maskVin(msg + err).slice(0, 300)}`);
    }
    return;
  }

  const data = obj.data;
  // Non-"V" topics (errors, alerts, connectivity) are not telemetry signals: summarise, don't count as bad.
  const txtype = isObject(obj.metadata) && typeof obj.metadata.txtype === "string" ? obj.metadata.txtype : "";
  if ((txtype && txtype !== "V") || Array.isArray(data)) {
    errorRecords++;
    logErrorRecord(obj, txtype, data);
    return;
  }
  if (!isObject(data)) {
    badLines++;
    return;
  }
  const vin = clean(typeof data.Vin === "string" && data.Vin ? data.Vin : typeof obj.vin === "string" ? obj.vin : "");
  const createdAt = typeof data.CreatedAt === "string" ? data.CreatedAt : "";
  if (!vin || Number.isNaN(Date.parse(createdAt))) {
    badLines++;
    return;
  }
  vinsSeen.add(tail4(vin));
  for (const [field, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.has(field)) continue;
    if (value === null || value === undefined || value === "<invalid>") continue;
    buffer.push({ vin, created_at: createdAt, field, value: clean(value) });
    acceptedRows++;
  }
  trimBuffer();
}

// The errors topic goes through the same logger (v0.9.5 datastore/simple/logger.go): msg record_payload, metadata.txtype
// "errors", top-level vin, and data = [{Name, Body, Tags, CreatedAt (unix)}]. Log a short summary, never tags/values.
function logErrorRecord(obj: Record<string, unknown>, txtype: string, data: unknown) {
  const who = typeof obj.vin === "string" && obj.vin ? tail4(obj.vin) : "?";
  const items = Array.isArray(data) ? data : [data];
  const first = items.find(isObject);
  if (!first) {
    console.log(`vehicle ${txtype || "errors"} vin=${who} items=${items.length}`);
    return;
  }
  const name = first.Name ?? first.name;
  const body = first.Body ?? first.body;
  if (name === undefined && body === undefined) {
    // Unknown shape: keys only, never values.
    console.log(`vehicle ${txtype || "errors"} vin=${who} items=${items.length} keys=${Object.keys(first).join(",").slice(0, 200)}`);
    return;
  }
  const text = maskVin(`${typeof name === "string" ? name : ""} ${typeof body === "string" ? body : ""}`.trim());
  console.log(`vehicle ${txtype || "errors"} vin=${who} items=${items.length} ${text.slice(0, 200)}`);
}

// Over the cap: drop the oldest rows, down to TRIM_TO, and say what window was lost (once per event).
function trimBuffer() {
  if (buffer.length <= MAX_BUFFER) return;
  const over = buffer.length - TRIM_TO;
  const dropped = buffer.slice(0, over);
  buffer = buffer.slice(over);
  droppedRows += over;
  let oldest = dropped[0].created_at;
  let newest = oldest;
  const vins = new Set<string>();
  for (const r of dropped) {
    if (Date.parse(r.created_at) < Date.parse(oldest)) oldest = r.created_at;
    if (Date.parse(r.created_at) > Date.parse(newest)) newest = r.created_at;
    vins.add(tail4(r.vin));
  }
  console.error(`buffer overflow: dropped ${over} rows ${oldest}..${newest} vehicles=${[...vins].join(",")}`);
}

type PostResult = "ok" | "retry" | "drop";
let deadline = Infinity; // set on shutdown so retries can't outlive the grace period
let stopping = false;

function dedupe(rows: Row[]): Row[] {
  // Same (vin, field, created_at) twice in one request is redundant; keep the last.
  const m = new Map<string, Row>();
  for (const r of rows) m.set(`${r.vin}|${r.field}|${r.created_at}`, r);
  return [...m.values()];
}

async function postBatch(rows: Row[]): Promise<PostResult> {
  const body = JSON.stringify(rows);
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) return "retry";
    try {
      const res = await fetch(`${TABLE_URL}?on_conflict=vin,field,created_at`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          // The unique index makes re-sent rows harmless; skip them instead of failing the batch.
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body,
        signal: AbortSignal.timeout(Math.min(15_000, left)),
      });
      if (res.ok) return "ok";
      if (res.status !== 429 && res.status < 500) {
        // Other 4xx (bad data, schema, auth) will never succeed on retry. Drop, or it blocks the queue forever.
        let detail = "";
        try {
          const j = (await res.json()) as Record<string, unknown>;
          detail = ` code=${String(j.code ?? "")} ${maskVin(String(j.message ?? ""))}`.slice(0, 260);
        } catch {
          // body not JSON
        }
        console.error(`supabase rejected batch of ${rows.length}, dropping: HTTP ${res.status}${detail}`);
        return "drop";
      }
      console.error(`supabase HTTP ${res.status}, attempt ${attempt + 1}/${RETRIES}`);
    } catch (e) {
      console.error(`supabase request failed (${e instanceof Error ? e.name : "error"}), attempt ${attempt + 1}/${RETRIES}`);
    }
    // While shutting down, don't wait out long backoffs.
    const wait = stopping ? 250 : Math.min(30_000, 1000 * 2 ** attempt);
    await Bun.sleep(Math.max(0, Math.min(wait, deadline - Date.now())));
  }
  return "retry";
}

let inflight: Promise<void> | null = null;
function flush(): Promise<void> {
  if (inflight) return inflight;
  if (buffer.length === 0) return Promise.resolve();
  inflight = (async () => {
    try {
      while (buffer.length > 0) {
        const batch = buffer.splice(0, MAX_BATCH);
        const result = await postBatch(dedupe(batch));
        if (result === "ok") {
          writtenRows += batch.length;
        } else if (result === "drop") {
          rejectedRows += batch.length;
        } else {
          // Transient failure: put back at the front for the next tick; stop this round.
          buffer = batch.concat(buffer);
          trimBuffer();
          break;
        }
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function pump(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return;
  const decoder = new TextDecoder();
  let carry = "";
  for await (const chunk of stream) {
    carry += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = carry.indexOf("\n")) >= 0) {
      const line = carry.slice(0, nl);
      carry = carry.slice(nl + 1);
      try {
        handleLine(line);
      } catch {
        badLines++;
      }
    }
    if (carry.length > 1_000_000) carry = ""; // runaway line without newline
  }
  if (carry) {
    try {
      handleLine(carry);
    } catch {
      badLines++;
    }
  }
}

const child = Bun.spawn([SERVER_BIN, "-config", CONFIG_PATH], {
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
});
console.log(`fleet-telemetry started (pid ${child.pid})`);

// Swallow stream errors (child killed mid-read); we only care that they finish.
const pumps = [pump(child.stdout as ReadableStream<Uint8Array>), pump(child.stderr as ReadableStream<Uint8Array>)].map((p) =>
  p.catch(() => {}),
);

let lastStats = "";
let lastStatsAt = Date.now();
const timer = setInterval(async () => {
  await flush();
  // Only log when something moved, plus a heartbeat so silence means "dead", not "idle".
  const counters =
    `lines=${seenLines} rows_accepted=${acceptedRows} rows_written=${writtenRows} rows_dropped=${droppedRows} ` +
    `rows_rejected=${rejectedRows} bad_lines=${badLines} errors=${errorRecords}`;
  if (counters !== lastStats || Date.now() - lastStatsAt >= HEARTBEAT_MS) {
    console.log(`stats ${counters} buffered=${buffer.length} vehicles=${vinsSeen.size}`);
    lastStats = counters;
    lastStatsAt = Date.now();
  }
}, FLUSH_MS);

async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  // Let the server wind down and the pumps read what it printed last, before the final flush.
  child.kill("SIGTERM");
  await Promise.race([Promise.all([child.exited, ...pumps]), Bun.sleep(SHUTDOWN_CHILD_MS)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  deadline = Date.now() + SHUTDOWN_FLUSH_MS;
  const left = () => Math.max(0, deadline - Date.now());
  // An in-flight timer flush may already hold a batch: wait for it, then flush whatever is left.
  if (inflight) await Promise.race([inflight, Bun.sleep(left())]);
  await Promise.race([flush(), Bun.sleep(left())]);
  process.exit(code);
}
process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

const code = await child.exited;
console.error(`fleet-telemetry exited with code ${code ?? "null"} signal ${child.signalCode ?? "none"}`);
await shutdown(code ? code : 1); // always non-zero (signal kill gives null) so Fly restarts the machine
