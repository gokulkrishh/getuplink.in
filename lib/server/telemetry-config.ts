import "server-only";
import { TELEMETRY_EXP_DAYS, TELEMETRY_HOSTNAME, TELEMETRY_PORT, telemetryFields } from "@/lib/telemetry-fields.mjs";
import { privateScalar, publicPoint, publicPointOfPem, signJws } from "@/lib/tesla-jws";
import { pem } from "./env";

// The streaming config Uplink sends a car itself, signed with the app's private key the way Tesla's
// vehicle-command proxy signs it (lib/tesla-jws.ts), for POST /api/1/vehicles/fleet_telemetry_config_jws.
// The same body scripts/telemetry-config.mjs sends through the proxy: lib/telemetry-fields.mjs.
//
// Env (both Vercel secrets; neither is ever logged or put in an error):
//   TESLA_PRIVATE_KEY_PEM  the P-256 private key behind TESLA_PUBLIC_KEY_PEM (keys/private-key.pem)
//   TELEMETRY_CA_PEM       the CA certificate that signed the receiver's TLS cert (fly/telemetry/README.md)
//   TELEMETRY_HOSTNAME     optional, default telemetry.getuplink.in
// Without the first two Uplink doesn't send configs, and /setup says Uplink will turn streaming on.

export function canSendConfig(): boolean {
  return Boolean(process.env.TESLA_PRIVATE_KEY_PEM && process.env.TELEMETRY_CA_PEM && process.env.TESLA_PUBLIC_KEY_PEM);
}

// The request body for fleet_telemetry_config_jws: the VINs and the signed config. Throws (with no key
// material in the message) when the keys are missing, unreadable, or the private key isn't the one whose
// public half Tesla knows: a config signed with another key would only be refused by the car.
export function signedTelemetryConfig(vins: string[], now: number = Date.now()): { vins: string[]; token: string } {
  const privatePem = process.env.TESLA_PRIVATE_KEY_PEM;
  const publicPem = process.env.TESLA_PUBLIC_KEY_PEM;
  const ca = process.env.TELEMETRY_CA_PEM;
  if (!privatePem || !publicPem || !ca) throw new Error("Streaming config keys aren't set");
  const caPem = pem(ca).trim();
  if (!caPem.includes("BEGIN CERTIFICATE")) throw new Error("TELEMETRY_CA_PEM isn't a PEM certificate");
  const scalar = privateScalar(pem(privatePem));
  if (!publicPoint(scalar).equals(publicPointOfPem(pem(publicPem)))) {
    throw new Error("TESLA_PRIVATE_KEY_PEM doesn't match TESLA_PUBLIC_KEY_PEM");
  }
  const config = {
    hostname: process.env.TELEMETRY_HOSTNAME || TELEMETRY_HOSTNAME,
    port: TELEMETRY_PORT,
    ca: caPem,
    fields: telemetryFields(),
    exp: Math.floor(now / 1000) + TELEMETRY_EXP_DAYS * 24 * 3600,
  };
  return { vins, token: signJws(scalar, config) };
}
