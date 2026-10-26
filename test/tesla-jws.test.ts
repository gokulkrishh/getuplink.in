import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { deterministicNonce, FLEET_TELEMETRY_AUDIENCE, privateScalar, publicPoint, publicPointOfPem, schnorrSign, signJws } from "@/lib/tesla-jws";
import { createHash } from "node:crypto";

// Vectors from teslamotors/vehicle-command internal/schnorr/sign_test.go and schnorr_test.go.
const hex = (s: string) => Buffer.from(s.replace(/\s|0x|,/g, ""), "hex");

describe("Tesla's Schnorr P-256 signatures", () => {
  test("the deterministic nonce matches RFC 6979 A.2.5", () => {
    const scalar = hex("c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721");
    const nonce = deterministicNonce(scalar, createHash("sha256").update("sample").digest());
    expect(nonce.toString("hex")).toBe("a6e3c57dd01abe90086538398355dd4c3b17aa873382b0f24d6129493d8aad60");
  });

  test("rejection sampling picks Tesla's resampled nonce", () => {
    const scalar = Buffer.alloc(32);
    scalar[0] = 3;
    const digest = hex("0080c36864c5f2f460e3767983c65677b65cef901bcedcb223f9b365c68f52f6");
    expect(deterministicNonce(scalar, digest).toString("hex")).toBe("264fc6592fbea24fd0954e0b86b886e8743161758ddad2f7e9fed75a0019e005");
  });

  test("signs 'hello world' exactly as vehicle-command does", () => {
    const scalar = Buffer.alloc(32);
    scalar[0] = 3;
    const expected =
      "7cfdbeb5baa730540401550bdefa20976453e8539ae4b2f26ce33125801a08f90ed20c3d846497ff82cc9772e3db4703982f47bd0b0b89dfb9a49cd2e524054602b1e05fbf95f5686faea7a5809eb92f5ecc22eae74ceccc5e2a65dd67ff20fc";
    expect(schnorrSign(scalar, Buffer.from("hello world")).toString("hex")).toBe(expected);
  });
});

describe("the config JWT", () => {
  test("carries alg Tesla.SS256, iss as the public key in standard base64, and the fleet audience", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const scalar = privateScalar(privateKey.export({ type: "sec1", format: "pem" }).toString());
    const token = signJws(scalar, { hostname: "telemetry.example", port: 443, exp: 1 });
    const [h, p, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "Tesla.SS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.aud).toBe(FLEET_TELEMETRY_AUDIENCE);
    expect(claims.hostname).toBe("telemetry.example");
    expect(Buffer.from(claims.iss, "base64").equals(publicPoint(scalar))).toBe(true);
    expect(claims.iss).toMatch(/=$/); // 65 bytes: standard base64 pads
    expect(Buffer.from(s, "base64url")).toHaveLength(96);
    expect(publicPointOfPem(publicKey.export({ type: "spki", format: "pem" }).toString()).equals(publicPoint(scalar))).toBe(true);
  });

  test("a bad key fails without its text in the message", () => {
    const secret = "-----BEGIN EC PRIVATE KEY-----\nnot-a-key-SECRETVALUE\n-----END EC PRIVATE KEY-----";
    expect(() => privateScalar(secret)).toThrow("The private key isn't a readable PEM key");
    try {
      privateScalar(secret);
    } catch (err) {
      expect(String(err)).not.toContain("SECRETVALUE");
    }
  });
});
