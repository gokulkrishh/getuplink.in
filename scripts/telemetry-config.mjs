#!/usr/bin/env node
// Push (or inspect) the Fleet Telemetry streaming config for one car.
//
//   node scripts/telemetry-config.mjs            dry run: prints the request, sends nothing
//   node scripts/telemetry-config.mjs --send     POST the config through the vehicle-command proxy
//   node scripts/telemetry-config.mjs --status   GET fleet_telemetry_config (look for synced: true)
//   node scripts/telemetry-config.mjs --errors   GET fleet_telemetry_errors
//
// Env:
//   TESLA_ACCESS_TOKEN     owner's Fleet API access token (never printed)
//   VIN                    the car
//   TELEMETRY_CA_FILE      PEM of OUR CA (the one that signed the server cert), needed for dry run / --send
//   TESLA_PROXY_URL        vehicle-command proxy, default https://localhost:4443  (--send only)
//   TESLA_PROXY_CA_FILE    the proxy's own TLS cert.pem (it is self-signed)       (--send only)
//   TESLA_FLEET_API_BASE_URL  default https://fleet-api.prd.na.vn.cloud.tesla.com (same as the app)
//   TELEMETRY_HOSTNAME     default telemetry.getuplink.in
//
// Signing: Tesla's docs say fleet_telemetry_config "should be called through the Vehicle Command
// Proxy", which signs the config with the app's private key (the one behind the public key at
// /.well-known). The raw fleet_telemetry_config_jws endpoint is documented as not recommended, so
// this script does NOT sign anything itself. Run the proxy locally:
//   tesla-http-proxy -tls-key proxy-tls-key.pem -cert proxy-cert.pem -key-file fleet-key.pem -port 4443
// (fleet-key.pem is the private key matching the app's registered public key.)

import { readFileSync } from "node:fs";
import https from "node:https";

const args = new Set(process.argv.slice(2));
const mode = args.has("--status") ? "status" : args.has("--errors") ? "errors" : args.has("--send") ? "send" : "dry";

const HOSTNAME = process.env.TELEMETRY_HOSTNAME || "telemetry.getuplink.in";
const PORT = 443;
const FLEET_BASE = (process.env.TESLA_FLEET_API_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com").replace(/\/$/, "");
const PROXY = (process.env.TESLA_PROXY_URL || "https://localhost:4443").replace(/\/$/, "");

// Field names verified against protos/vehicle_data.proto (teslamotors/fleet-telemetry). No location.
const fields = {};
const set = (names, interval_seconds, extra = {}) => {
  for (const n of names) fields[n] = { interval_seconds, ...extra };
};
set(["DetailedChargeState", "FastChargerPresent", "FastChargerType", "ACChargingPower", "DCChargingPower", "ACChargingEnergyIn", "DCChargingEnergyIn", "ChargeLimitSoc"], 60);
set(["Soc", "BatteryLevel", "RatedRange", "EnergyRemaining"], 300);
set(["Odometer", "Gear"], 300);
// Tesla: SelfDrivingMilesSinceReset needs minimum_delta explicitly set to >= 1 (HW4, fw 2025.44.25.5+).
set(["SelfDrivingMilesSinceReset"], 3600, { minimum_delta: 1 });
set(
  ["Version", "SoftwareUpdateVersion", "SoftwareUpdateDownloadPercentComplete", "SoftwareUpdateInstallationPercentComplete", "SoftwareUpdateExpectedDurationMinutes", "SoftwareUpdateScheduledStartTime"],
  60,
);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function usage() {
  return [
    "Usage: node scripts/telemetry-config.mjs [--send | --status | --errors]",
    "  (no flag)  dry run, prints the request body",
    "Required env: VIN, TELEMETRY_CA_FILE (dry run and --send); plus TESLA_ACCESS_TOKEN for --send/--status/--errors.",
    "Optional env: TESLA_PROXY_URL, TESLA_PROXY_CA_FILE, TESLA_FLEET_API_BASE_URL, TELEMETRY_HOSTNAME.",
  ].join("\n");
}

const vin = process.env.VIN;
const token = process.env.TESLA_ACCESS_TOKEN;
const needVin = () => vin || die(`Missing VIN.\n${usage()}`);
const needToken = () => token || die(`Missing TESLA_ACCESS_TOKEN.\n${usage()}`);

function buildBody() {
  const caFile = process.env.TELEMETRY_CA_FILE;
  if (!caFile) die(`Missing TELEMETRY_CA_FILE (path to our CA certificate PEM).\n${usage()}`);
  let ca;
  try {
    ca = readFileSync(caFile, "utf8").trim();
  } catch (e) {
    die(`Cannot read TELEMETRY_CA_FILE ${caFile}: ${e.message}`);
  }
  if (!ca.includes("BEGIN CERTIFICATE")) die(`${caFile} does not look like a PEM certificate.`);
  return {
    vins: [needVin()],
    config: {
      hostname: HOSTNAME,
      port: PORT,
      ca,
      fields,
      // ~1 year, unix seconds
      exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    },
  };
}

const masked = (v) => `*${String(v).slice(-4)}`;

function request(url, { method = "GET", body, ca } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function show({ status, text }) {
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  console.log(`HTTP ${status}\n${out}`);
  if (status >= 400) process.exit(1);
}

if (mode === "dry") {
  const body = buildBody();
  const preview = { ...body, vins: body.vins.map(masked), config: { ...body.config, ca: `${body.config.ca.split("\n")[0]} ... (${body.config.ca.length} chars)` } };
  console.log(`DRY RUN. Would POST ${PROXY}/api/1/vehicles/fleet_telemetry_config\n${JSON.stringify(preview, null, 2)}\nexp = ${new Date(body.config.exp * 1000).toISOString()}\nRe-run with --send to send.`);
} else if (mode === "send") {
  needToken();
  const body = buildBody();
  let proxyCa;
  if (process.env.TESLA_PROXY_CA_FILE) proxyCa = readFileSync(process.env.TESLA_PROXY_CA_FILE);
  else console.error("Note: TESLA_PROXY_CA_FILE not set; the proxy's self-signed cert will be rejected unless it is trusted another way.");
  try {
    show(await request(`${PROXY}/api/1/vehicles/fleet_telemetry_config`, { method: "POST", body: JSON.stringify(body), ca: proxyCa }));
  } catch (e) {
    die(`Request to the proxy failed: ${e.message}. Is tesla-http-proxy running at ${PROXY}?`);
  }
} else {
  needToken();
  needVin();
  const path = mode === "status" ? "fleet_telemetry_config" : "fleet_telemetry_errors";
  try {
    show(await request(`${FLEET_BASE}/api/1/vehicles/${encodeURIComponent(vin)}/${path}`));
  } catch (e) {
    die(`Request failed: ${e.message}`);
  }
}
