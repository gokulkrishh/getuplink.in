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
let badLines = 0;
const vinsSeen = new Set<string>();

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
  if (!isObject(data)) {
    badLines++;
    return;
  }
  const vin = typeof data.Vin === "string" && data.Vin ? data.Vin : typeof obj.vin === "string" ? obj.vin : "";
  const createdAt = typeof data.CreatedAt === "string" ? data.CreatedAt : "";
  if (!vin || Number.isNaN(Date.parse(createdAt))) {
    badLines++;
    return;
  }
  vinsSeen.add(tail4(vin));
  for (const [field, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.has(field)) continue;
    if (value === null || value === undefined || value === "<invalid>") continue;
    buffer.push({ vin, created_at: createdAt, field, value });
    acceptedRows++;
  }
  if (buffer.length > MAX_BUFFER) {
    const over = buffer.length - MAX_BUFFER;
    buffer = buffer.slice(over);
    droppedRows += over;
  }
}

async function postBatch(rows: Row[]): Promise<boolean> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(TABLE_URL, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      // 4xx other than rate limiting will not fix itself by retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
        console.error(`supabase rejected batch of ${rows.length}: HTTP ${res.status}`);
        return false;
      }
      console.error(`supabase HTTP ${res.status}, attempt ${attempt + 1}/${RETRIES}`);
    } catch (e) {
      console.error(`supabase request failed (${e instanceof Error ? e.name : "error"}), attempt ${attempt + 1}/${RETRIES}`);
    }
    await Bun.sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
  return false;
}

let flushing = false;
async function flush() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  try {
    while (buffer.length > 0) {
      const batch = buffer.splice(0, MAX_BATCH);
      const ok = await postBatch(batch);
      if (ok) {
        writtenRows += batch.length;
      } else if (batch.length > 0) {
        // Put back at the front for the next tick; stop this round.
        buffer = batch.concat(buffer);
        break;
      }
    }
  } finally {
    flushing = false;
  }
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

void pump(child.stdout as ReadableStream<Uint8Array>);
void pump(child.stderr as ReadableStream<Uint8Array>);

const timer = setInterval(async () => {
  const pending = buffer.length;
  await flush();
  if (seenLines > 0 || pending > 0 || droppedRows > 0) {
    console.log(
      `stats lines=${seenLines} rows_accepted=${acceptedRows} rows_written=${writtenRows} ` +
        `rows_dropped=${droppedRows} bad_lines=${badLines} buffered=${buffer.length} vehicles=${vinsSeen.size}`,
    );
  }
}, FLUSH_MS);

let stopping = false;
async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  child.kill();
  await Promise.race([flush(), Bun.sleep(8_000)]);
  process.exit(code);
}
process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

const code = await child.exited;
console.error(`fleet-telemetry exited with code ${code}`);
await shutdown(code === 0 ? 1 : code); // non-zero so Fly restarts the machine
