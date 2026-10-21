import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

// TOKEN_ENCRYPTION_KEY is 32 random bytes, base64 encoded (openssl rand -base64 32).
function key(): Buffer {
  const buf = Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
}

// Output: v1.<iv>.<tag>.<ciphertext>, each part base64url.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised token payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
