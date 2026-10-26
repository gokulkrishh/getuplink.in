// Signs a Fleet Telemetry config the way Tesla's vehicle-command proxy does, so Uplink can send it to
// POST /api/1/vehicles/fleet_telemetry_config_jws itself. A port of teslamotors/vehicle-command:
//   internal/schnorr (sign.go, schnorr.go): Schnorr signatures over NIST P-256 with SHA-256 (RFC 8235),
//     with a deterministic nonce (RFC 6979);
//   internal/authentication/jwt.go: the JWT, alg "Tesla.SS256", iss = the public key, aud set by the caller;
//   pkg/sign: aud "com.tesla.fleet.TelemetryClient" for a config any car with the key accepts.
// test/tesla-jws.test.ts checks it against that repository's own test vectors.
//
// The point maths runs in OpenSSL (node:crypto ECDH), so the nonce never meets a JavaScript
// multiplication; only the final scalar step, r = v - a*c mod n, uses BigInt.

import { createECDH, createHash, createHmac, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

// The subgroup order. BigInt() rather than a literal: tsconfig targets ES2017.
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const ZERO = BigInt(0);
// The P-256 generator, uncompressed.
const G = Buffer.from(
  "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
  "hex",
);
const SCALAR = 32;

export const FLEET_TELEMETRY_AUDIENCE = "com.tesla.fleet.TelemetryClient";

const toBig = (b: Uint8Array) => BigInt(`0x${Buffer.from(b).toString("hex") || "0"}`);
const toBytes = (n: bigint) => Buffer.from(n.toString(16).padStart(SCALAR * 2, "0"), "hex");
const mod = (n: bigint) => ((n % N) + N) % N;
const hmac = (key: Buffer, ...parts: Buffer[]) => {
  const h = createHmac("sha256", key);
  for (const p of parts) h.update(p);
  return h.digest();
};

// RFC 6979 section 3.2, for P-256 and SHA-256 only (hlen = qlen = 256 bits), as sign.go has it.
export function deterministicNonce(scalar: Buffer, messageHash: Buffer): Buffer {
  const h1 = toBytes(mod(toBig(messageHash)));
  let v = Buffer.alloc(SCALAR, 0x01);
  let k = Buffer.alloc(SCALAR, 0x00);
  k = hmac(k, v, Buffer.from([0x00]), scalar, h1);
  v = hmac(k, v);
  k = hmac(k, v, Buffer.from([0x01]), scalar, h1);
  v = hmac(k, v);
  for (;;) {
    v = hmac(k, v);
    const t = toBig(v);
    if (t > ZERO && t < N) return v;
    k = hmac(k, v, Buffer.from([0x00]));
    v = hmac(k, v);
  }
}

function lengthValue(h: ReturnType<typeof createHash>, buf: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length);
  h.update(len);
  h.update(buf);
}

function challenge(publicNonce: Buffer, publicKey: Buffer, message: Buffer): Buffer {
  const h = createHash("sha256");
  lengthValue(h, G);
  lengthValue(h, publicNonce);
  lengthValue(h, publicKey);
  lengthValue(h, message);
  return h.digest();
}

// The uncompressed public point (65 bytes) of a private scalar.
export function publicPoint(scalar: Buffer): Buffer {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(scalar);
  return ecdh.getPublicKey();
}

// (V, r): V = vG without its 0x04 prefix (64 bytes), then r = v - a*c mod n (32 bytes).
export function schnorrSign(scalar: Buffer, message: Buffer): Buffer {
  const digest = createHash("sha256").update(message).digest();
  const nonce = deterministicNonce(scalar, digest);
  const publicNonce = publicPoint(nonce);
  const c = toBig(challenge(publicNonce, publicPoint(scalar), message));
  const r = mod(toBig(nonce) - mod(toBig(scalar) * c));
  return Buffer.concat([publicNonce.subarray(1), toBytes(r)]);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// The JWT the proxy sends as `token`: header and claims as golang-jwt writes them, iss the public key in
// standard base64 (with padding), aud the audience.
export function signJws(scalar: Buffer, claims: Record<string, unknown>, audience = FLEET_TELEMETRY_AUDIENCE): string {
  const header = b64url(JSON.stringify({ alg: "Tesla.SS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iss: publicPoint(scalar).toString("base64"), aud: audience }));
  const signingString = `${header}.${payload}`;
  return `${signingString}.${b64url(schnorrSign(scalar, Buffer.from(signingString)))}`;
}

// The private scalar of a P-256 key in PEM (SEC1 "EC PRIVATE KEY" or PKCS#8). Errors never carry key text.
export function privateScalar(pemText: string): Buffer {
  let key: KeyObject;
  try {
    key = createPrivateKey(pemText);
  } catch {
    throw new Error("The private key isn't a readable PEM key");
  }
  const jwk = key.export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d) throw new Error("The private key isn't a P-256 key");
  return Buffer.from(jwk.d, "base64url");
}

// The uncompressed point of a public key in PEM, to check the private key against the one Tesla knows.
export function publicPointOfPem(pemText: string): Buffer {
  let key: KeyObject;
  try {
    key = createPublicKey(pemText);
  } catch {
    throw new Error("The public key isn't a readable PEM key");
  }
  const jwk = key.export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) throw new Error("The public key isn't a P-256 key");
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
}
