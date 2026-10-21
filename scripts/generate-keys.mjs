#!/usr/bin/env node
// Generates the prime256v1 (P-256) EC key pair Tesla requires for partner registration.
// Usage: node scripts/generate-keys.mjs
// Writes keys/private-key.pem and keys/public-key.pem (both gitignored).
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const dir = "keys";
const privatePath = `${dir}/private-key.pem`;
const publicPath = `${dir}/public-key.pem`;

if (existsSync(privatePath) && !process.argv.includes("--force")) {
  console.error(`${privatePath} already exists. Re-run with --force to replace it (you would need to re-register).`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "sec1", format: "pem" },
});

mkdirSync(dir, { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey);

console.log(`Wrote ${publicPath} and ${privatePath}.

Next steps:
  1. Add the public key to Vercel as TESLA_PUBLIC_KEY_PEM (paste the file as-is, newlines included):
       vercel env add TESLA_PUBLIC_KEY_PEM production < ${publicPath}
  2. Keep ${privatePath} somewhere safe (a password manager). Never commit it.
     This app only reads vehicle data, so it does not need the private key at runtime.
  3. Redeploy, then check https://tesla-in-updates.vercel.app/.well-known/appspecific/com.tesla.3p.public-key.pem
  4. Register the domain: node --env-file=.env.local scripts/register-partner.mjs

Public key:
${publicKey}`);
