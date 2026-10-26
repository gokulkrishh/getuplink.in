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
// /.well-known) and posts it to fleet_telemetry_config_jws. This script doesn't sign anything itself.
// The app does, the same way (lib/tesla-jws.ts, checked against vehicle-command's test vectors), once a
// new owner adds the key on /setup; the fields both send live in lib/telemetry-fields.mjs. Use this
// script when the app can't (TESLA_PRIVATE_KEY_PEM unset). Run the proxy locally:
//   tesla-http-proxy -tls-key proxy-tls-key.pem -cert proxy-cert.pem -key-file fleet-key.pem -port 4443
// (fleet-key.pem is the private key matching the app's registered public key.)

import { readFileSync } from "node:fs";
import https from "node:https";
import { TELEMETRY_EXP_DAYS, TELEMETRY_HOSTNAME, TELEMETRY_PORT, telemetryFields } from "../lib/telemetry-fields.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--status") ? "status" : args.has("--errors") ? "errors" : args.has("--send") ? "send" : "dry";

const HOSTNAME = process.env.TELEMETRY_HOSTNAME || TELEMETRY_HOSTNAME;
const PORT = TELEMETRY_PORT;
const FLEET_BASE = (process.env.TESLA_FLEET_API_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com").replace(/\/$/, "");
const PROXY = (process.env.TESLA_PROXY_URL || "https://localhost:4443").replace(/\/$/, "");

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

// The fields and their intervals: lib/telemetry-fields.mjs, shared with the app.
const fields = telemetryFields();

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
      // Unix seconds. Tesla rejects anything past ~364 days ahead, so stay under a year.
      exp: Math.floor(Date.now() / 1000) + TELEMETRY_EXP_DAYS * 24 * 3600,
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
