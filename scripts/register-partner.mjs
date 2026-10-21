#!/usr/bin/env node
// One-time Tesla partner registration for this app's domain.
// Usage: bun --env-file=.env.local scripts/register-partner.mjs
// Needs TESLA_CLIENT_ID and TESLA_CLIENT_SECRET; the public key must already be live
// at https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem.
const TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
const base = (process.env.TESLA_FLEET_API_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com").replace(/\/$/, "");
const domain = process.env.TESLA_PARTNER_DOMAIN || "app.getuplink.in";

for (const name of ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Run with: bun --env-file=.env.local scripts/register-partner.mjs`);
    process.exit(1);
  }
}

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

const keyUrl = `https://${domain}/.well-known/appspecific/com.tesla.3p.public-key.pem`;
const keyRes = await fetch(keyUrl);
if (!keyRes.ok) {
  console.error(`Public key is not reachable at ${keyUrl} (${keyRes.status}). Deploy with TESLA_PUBLIC_KEY_PEM first.`);
  process.exit(1);
}

console.log(`Requesting a partner token for ${base}…`);
const { access_token } = await call(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.TESLA_CLIENT_ID,
    client_secret: process.env.TESLA_CLIENT_SECRET,
    scope: "openid vehicle_device_data",
    audience: base,
  }),
});

const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

console.log(`Registering ${domain}…`);
const registered = await call(`${base}/api/1/partner_accounts`, {
  method: "POST",
  headers,
  body: JSON.stringify({ domain }),
});
console.log(JSON.stringify(registered.response ?? registered, null, 2));

const check = await call(`${base}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(domain)}`, { headers });
console.log(`\nTesla now has this public key on file for ${domain}:`);
console.log(JSON.stringify(check.response ?? check, null, 2));
