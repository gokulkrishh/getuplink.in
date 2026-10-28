import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { INVITE_TTL_MS, type InviteState, inviteState, isInviteToken, shownInvites } from "@/lib/invites";
import type { Owner } from "./data/owner";
import { insertInvite, inviteByHash, inviteById, type InviteRow, InvitesUnavailable, recentInvites, revokeInviteRow } from "./data/system";
import { env } from "./env";

// Invite links: /invite/<token>, for one friend's car (the last 6 characters of its VIN), single use, for a
// day. Only the token's sha256 is stored. The token is an HMAC, under a key derived from
// TOKEN_ENCRYPTION_KEY, of the invite's created_at and VIN characters, so the admin can copy an unused
// link again while a copy of the table alone can't make one. Tokens are never logged.

// Demo mode has no secrets and stores no invite: its links are made up and lead nowhere.
function key(context: string): Buffer {
  return createHash("sha256").update(`${context}:${DEMO ? "demo" : env("TOKEN_ENCRYPTION_KEY")}`).digest();
}

export function inviteToken(createdAt: string, vinSuffix: string): string {
  return createHmac("sha256", key("uplink/invite/v1")).update(`${Date.parse(createdAt)}:${vinSuffix}`).digest("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// The invite a token hash names, compared again in constant time. Throws InvitesUnavailable before the migration.
export async function inviteForHash(hash: string): Promise<InviteRow | null> {
  const invite = await inviteByHash(hash);
  return invite && sameHex(invite.token_hash, hash) ? invite : null;
}

// ---- The invite cookie: carries an opened invite through Tesla's sign-in ----

// Short-lived and signed: "<token hash>.<expires ms>.<hmac>". Only /api/auth (the callback) sees it.
export const INVITE_COOKIE = "tiu_invite";
export const INVITE_COOKIE_PATH = "/api/auth";
export const INVITE_COOKIE_MAX_AGE = 600;

function cookieSignature(payload: string): string {
  return createHmac("sha256", key("uplink/invite-cookie/v1")).update(payload).digest("hex");
}

export function inviteCookieValue(hash: string, now: number): string {
  const payload = `${hash}.${now + INVITE_COOKIE_MAX_AGE * 1000}`;
  return `${payload}.${cookieSignature(payload)}`;
}

// The token hash an invite cookie carries, or null when it's missing, forged or out of date.
export function inviteCookieHash(value: string | undefined, now: number): string | null {
  const [hash, expires, signature, ...rest] = value?.split(".") ?? [];
  if (rest.length || !hash || !expires || !signature || !/^[0-9a-f]{64}$/.test(hash) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  if (!(Number(expires) > now)) return null;
  try {
    return sameHex(signature, cookieSignature(`${hash}.${expires}`)) ? hash : null;
  } catch {
    return null;
  }
}

// ---- A light limit on invite page lookups, per address, per instance ----

const LOOKUP_LIMIT = 20;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;
const lookups = new Map<string, { count: number; since: number }>();

export function allowInviteLookup(address: string, now: number): boolean {
  const seen = lookups.get(address);
  if (!seen || now - seen.since >= LOOKUP_WINDOW_MS) {
    if (lookups.size > 10_000) lookups.clear();
    lookups.set(address, { count: 1, since: now });
    return true;
  }
  seen.count++;
  return seen.count <= LOOKUP_LIMIT;
}

// The caller's address, from the headers Vercel sets.
export function clientAddress(headers: { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

// ---- What the invite page says ----

export type InviteLookup = InviteState | "unknown" | "unavailable";

export async function lookupInvite(token: string, now: number): Promise<InviteLookup> {
  if (!isInviteToken(token)) return "unknown";
  if (DEMO) return "unused";
  try {
    const invite = await inviteForHash(tokenHash(token));
    return invite ? inviteState(invite, now) : "unknown";
  } catch (err) {
    if (err instanceof InvitesUnavailable) return "unavailable";
    throw err;
  }
}

// ---- The admin's side (the caller has checked adminOwner for this very request) ----

export const inviteUrl = (origin: string, token: string) => `${origin}/invite/${token}`;

export type InviteItem = {
  id: number;
  label: string | null;
  vinSuffix: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  state: InviteState;
  joined: string | null; // "Model Y · 4821"
  joinedUserId: number | null;
  joinedApproved: boolean; // still approved, so Suspend applies
};

export type InvitesPage = { available: boolean; items: InviteItem[] };

export const INVITES_SHOWN = 20;

const DAY = 86_400_000;

function demoInvites(now: number): InvitesPage {
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  return {
    available: true,
    items: [
      { id: 4, label: "Arun's Model Y", vinSuffix: "A48210", createdAt: at(0.1), expiresAt: at(-0.9), usedAt: null, state: "unused", joined: null, joinedUserId: null, joinedApproved: false },
      { id: 3, label: null, vinSuffix: "C11957", createdAt: at(2), expiresAt: at(1), usedAt: at(1.8), state: "used", joined: "Model Y · 1957", joinedUserId: 12, joinedApproved: true },
      { id: 2, label: "Neighbour", vinSuffix: "B70033", createdAt: at(5), expiresAt: at(4), usedAt: null, state: "expired", joined: null, joinedUserId: null, joinedApproved: false },
    ],
  };
}

export async function loadInvites(now: number): Promise<InvitesPage> {
  if (DEMO) return demoInvites(now);
  try {
    const rows = await recentInvites(INVITES_SHOWN);
    return {
      available: true,
      items: shownInvites(rows.map((r) => ({
        id: r.id,
        label: r.label,
        vinSuffix: r.vin_suffix,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        usedAt: r.used_at,
        state: inviteState(r, now),
        joined: r.joined_label,
        joinedUserId: r.used_by,
        joinedApproved: r.joinedStatus === "approved",
      }))),
    };
  } catch (err) {
    if (err instanceof InvitesUnavailable) return { available: false, items: [] };
    throw err;
  }
}

// A new link for this car, good for a day. Returns its token (shown once here, and again by Copy).
export async function createInvite(admin: Owner, vinSuffix: string, label: string | null, now: number): Promise<string> {
  const createdAt = new Date(now).toISOString();
  const token = inviteToken(createdAt, vinSuffix);
  if (DEMO) return token;
  await insertInvite({
    token_hash: tokenHash(token),
    vin_suffix: vinSuffix,
    label,
    created_by: admin.userId,
    created_at: createdAt,
    expires_at: new Date(now + INVITE_TTL_MS).toISOString(),
  });
  return token;
}

// An unused, unexpired invite's token again, or null for any other.
export async function inviteTokenAgain(id: number, now: number): Promise<string | null> {
  if (DEMO) return inviteToken(new Date(now).toISOString(), "A48210");
  const invite = await inviteById(id);
  if (!invite || inviteState(invite, now) !== "unused") return null;
  const token = inviteToken(invite.created_at, invite.vin_suffix);
  return sameHex(tokenHash(token), invite.token_hash) ? token : null;
}

// The VIN characters and label of an invite, for New link.
export async function inviteForRenewal(id: number): Promise<{ vinSuffix: string; label: string | null } | null> {
  const invite = await inviteById(id);
  return invite && !invite.used_at ? { vinSuffix: invite.vin_suffix, label: invite.label } : null;
}

export async function revokeInvite(id: number, now: number): Promise<boolean> {
  if (DEMO) return true;
  return revokeInviteRow(id, new Date(now).toISOString());
}
