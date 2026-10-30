import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { isViewToken, VIEW_LINK_LIMIT, type ViewLink, viewLinkHides, viewLinkLabel, viewLinkLengthMs } from "@/lib/view-links";
import { type Owner, ownerDb } from "./data/owner";
import { env } from "./env";
import {
  insertViewLink,
  openViewLinks,
  claimViewLinkRow,
  revokeViewLinkRow,
  setViewLinkHideLocationsRow,
  setViewLinkTokenHash,
  viewLinkByHash,
  viewLinkById,
  type ViewLinkRow,
  ViewLinksUnavailable,
} from "./data/view-links";

// View links: /v/<token> lets someone the owner trusts see the owner's car in Uplink, read-only, until the
// link ends. Like invite links (./invites.ts), the token is an HMAC, under a key derived from
// TOKEN_ENCRYPTION_KEY with its own context, of the link's id and created_at: the owner can copy an open link
// again from Settings, while a copy of the table alone can't make one. Only the token's sha256 is stored, for
// the lookup. Tokens are never logged.

export { ViewLinksUnavailable };

function key(): Buffer {
  return createHash("sha256").update(`uplink/view-link/v1:${DEMO ? "demo" : env("TOKEN_ENCRYPTION_KEY")}`).digest();
}

// The link's token, the same every time for the same row: 32 bytes in base64url (43 characters).
export function viewLinkToken(id: number, createdAt: string): string {
  return createHmac("sha256", key()).update(`${id}:${Date.parse(createdAt)}`).digest("base64url");
}

export function viewTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// Open: not ended by the owner and not past its end.
export const isOpen = (row: Pick<ViewLinkRow, "revoked_at" | "expires_at">, now: number) => row.revoked_at === null && Date.parse(row.expires_at) > now;

export const asViewLink = (r: ViewLinkRow): ViewLink => ({
  id: r.id,
  label: r.label,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  viewCount: r.view_count,
  lastViewedAt: r.last_viewed_at,
  hideLocations: r.hide_locations,
});

// ---- Opening a link (/v/<token>) ----

// The open link a token names; null when it is unknown, ended or past its end. Nothing is used up here: a
// chat app's link preview fetches /v/<token> too. The browser that runs /v/open's script claims it
// (claimViewLink). Throws ViewLinksUnavailable before the migration.
export async function openViewLink(token: string, now: number): Promise<ViewLinkRow | null> {
  if (DEMO || !isViewToken(token)) return null;
  const hash = viewTokenHash(token);
  const row = await viewLinkByHash(hash);
  return row && sameHex(row.token_hash, hash) && isOpen(row, now) ? row : null;
}

// A link opens in one browser. Used once a browser has claimed it.
export const isUsed = (row: Pick<ViewLinkRow, "last_viewed_at">) => row.last_viewed_at !== null;

// Claims an open, unused link for this browser, at `now`: the row when this browser won, null when the
// link was already used, has ended, or another browser won the race. Throws ViewLinksUnavailable before
// the migration.
export async function claimViewLink(id: number, now: number): Promise<ViewLinkRow | null> {
  if (DEMO) return null;
  return claimViewLinkRow(id, new Date(now).toISOString());
}

// The link a viewer cookie names, read fresh, when it is still open; null otherwise (ended, past its end,
// gone with its account, or before the migration).
export async function liveViewLink(id: number, now: number): Promise<ViewLinkRow | null> {
  if (DEMO) return null;
  try {
    const row = await viewLinkById(id);
    return row && isOpen(row, now) ? row : null;
  } catch (err) {
    if (err instanceof ViewLinksUnavailable) return null;
    throw err;
  }
}

// ---- The owner's side (the caller has checked currentOwner for this very request) ----

export type ViewLinksPage = { available: boolean; links: ViewLink[] };

export async function loadViewLinks(owner: Owner, now: number): Promise<ViewLinksPage> {
  if (DEMO) return { available: true, links: [] };
  try {
    return { available: true, links: (await openViewLinks(owner, new Date(now).toISOString())).map(asViewLink) };
  } catch (err) {
    if (err instanceof ViewLinksUnavailable) return { available: false, links: [] };
    throw err;
  }
}

export type MakeResult = { token: string; link: ViewLink } | { refused: "label" | "length" | "hides" | "limit" | "unavailable" | "demo" };

// A new link and its token (rebuilt later by viewLinkTokenAgain). Refused past VIEW_LINK_LIMIT open links,
// for a name that's blank or too long, a length that isn't one of the three, or hides that aren't two
// true-or-false choices. Hide locations is stored with it; the owner can change it while the link is open
// (setViewLinkHideLocations).
export async function makeViewLink(owner: Owner, rawLabel: unknown, rawLength: unknown, now: number, rawHides: unknown): Promise<MakeResult> {
  if (owner.viewOnly) throw new Error("A view link can't make another");
  const label = viewLinkLabel(rawLabel);
  if (!label) return { refused: "label" };
  const length = viewLinkLengthMs(rawLength);
  if (!length) return { refused: "length" };
  const hides = viewLinkHides(rawHides);
  if (!hides) return { refused: "hides" };
  if (DEMO) return { refused: "demo" };
  try {
    const open = await openViewLinks(owner, new Date(now).toISOString());
    if (open.length >= VIEW_LINK_LIMIT) return { refused: "limit" };
    // The token needs the row's id, so the row goes in with a throwaway hash that opens nothing (no token
    // hashes to it), then gets its real one.
    const row = await insertViewLink(owner, {
      token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      label,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + length).toISOString(),
      hide_locations: hides.hideLocations,
    });
    const token = viewLinkToken(row.id, row.created_at);
    try {
      await setViewLinkTokenHash(owner, row.id, viewTokenHash(token));
    } catch (err) {
      // A link nobody can open mustn't hold one of the owner's places.
      await revokeViewLinkRow(owner, row.id, new Date(now).toISOString()).catch(() => {});
      throw err;
    }
    return { token, link: asViewLink(row) };
  } catch (err) {
    if (err instanceof ViewLinksUnavailable) return { refused: "unavailable" };
    throw err;
  }
}

// An open link's token again, for Settings' Copy link: only the owner's own, only while it's open, and only
// when the rebuilt token is the one stored (a link made before tokens were rebuildable never is). Null
// otherwise.
export async function viewLinkTokenAgain(owner: Owner, id: number, now: number): Promise<string | null> {
  if (owner.viewOnly) throw new Error("A view link can't copy another");
  if (DEMO) return null;
  const row = await viewLinkById(id);
  if (!row || row.user_id !== owner.userId || !isOpen(row, now)) return null;
  const token = viewLinkToken(row.id, row.created_at);
  return sameHex(viewTokenHash(token), row.token_hash) ? token : null;
}

// Ends one of the owner's links at once. Another owner's id matches nothing.
export async function endViewLink(owner: Owner, id: number, now: number): Promise<boolean> {
  if (owner.viewOnly) throw new Error("A view link can't end another");
  if (DEMO) return true;
  return revokeViewLinkRow(owner, id, new Date(now).toISOString());
}

// Hide locations on or off for one of the owner's open links, from its next request on. Another owner's
// id, or an ended link, changes nothing (false).
export async function setViewLinkHideLocations(owner: Owner, id: number, hide: boolean, now: number): Promise<boolean> {
  if (owner.viewOnly) throw new Error("A view link can't change another");
  if (DEMO) return true;
  return setViewLinkHideLocationsRow(owner, id, hide, new Date(now).toISOString());
}
