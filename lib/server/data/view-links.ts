import "server-only";
import { db } from "@/lib/server/supabase";
import type { Owner } from "./owner";

// View links (supabase/migrations/20261116120000_car_view_links.sql). Where the applied SQL's comments
// no longer hold, kept here rather than editing an applied migration:
// - hide_locations can be changed while a link is open (setViewLinkHideLocationsRow), not fixed once made.
// - hide_costs is unused: costs are always shared and nothing reads or writes the column.
// - A link opens in one browser: last_viewed_at set means used (claimViewLinkRow), and view_count is 0 or 1.
// - token_hash is the sha256 of a token rebuilt from the row's id and created_at (lib/server/view-links.ts),
//   not of 32 random bytes shown once.
// Lookups by token hash and by id
// serve the /v route and every viewer request, which have no owner yet; the owner's list, making and
// ending go through the owner's user id.

const MISSING_TABLE = ["42P01", "PGRST205"];
const TABLE = "car_view_links";

// Before the migration there is no table: view links are unavailable.
export class ViewLinksUnavailable extends Error {
  constructor() {
    super("View links aren't set up yet");
  }
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error && MISSING_TABLE.includes(result.error.code ?? "")) throw new ViewLinksUnavailable();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export type ViewLinkRow = {
  id: number;
  user_id: number;
  token_hash: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  hide_locations: boolean;
};

const COLUMNS = "id, user_id, token_hash, label, created_at, expires_at, revoked_at, view_count, last_viewed_at, hide_locations";

const asRow = (r: ViewLinkRow): ViewLinkRow => ({
  ...r,
  id: Number(r.id),
  user_id: Number(r.user_id),
  revoked_at: r.revoked_at ?? null,
  last_viewed_at: r.last_viewed_at ?? null,
  view_count: Number(r.view_count ?? 0),
  hide_locations: r.hide_locations === true,
});

// The link with this token hash, or null. The caller compares the hash again in constant time.
export async function viewLinkByHash(tokenHash: string): Promise<ViewLinkRow | null> {
  const row = check(await db().from(TABLE).select(COLUMNS).eq("token_hash", tokenHash).limit(1).maybeSingle()) as ViewLinkRow | null;
  return row ? asRow(row) : null;
}

export async function viewLinkById(id: number): Promise<ViewLinkRow | null> {
  const row = check(await db().from(TABLE).select(COLUMNS).eq("id", id).limit(1).maybeSingle()) as ViewLinkRow | null;
  return row ? asRow(row) : null;
}

// Claims an open, unused link at `now`: one browser only. A single conditional update, so of two browsers
// racing exactly one matches the row (last_viewed_at still null) and gets it back; the other gets null.
// last_viewed_at set is what "used" means; view_count stays 0 or 1. Never who opened it.
export async function claimViewLinkRow(id: number, now: string): Promise<ViewLinkRow | null> {
  const rows = check(
    await db().from(TABLE).update({ view_count: 1, last_viewed_at: now }).eq("id", id).is("last_viewed_at", null).is("revoked_at", null).gt("expires_at", now).select(COLUMNS),
  ) as ViewLinkRow[] | null;
  return rows?.length ? asRow(rows[0]) : null;
}

// The owner's links that haven't ended at `now`, newest first.
export async function openViewLinks(owner: Owner, now: string): Promise<ViewLinkRow[]> {
  const rows = check(
    await db().from(TABLE).select(COLUMNS).eq("user_id", owner.userId).is("revoked_at", null).gt("expires_at", now).order("created_at", { ascending: false }),
  ) as ViewLinkRow[] | null;
  return (rows ?? []).map(asRow);
}

export async function insertViewLink(owner: Owner, row: { token_hash: string; label: string; created_at: string; expires_at: string; hide_locations: boolean }): Promise<ViewLinkRow> {
  return asRow(check(await db().from(TABLE).insert({ ...row, user_id: owner.userId }).select(COLUMNS).single()) as ViewLinkRow);
}

// The link's real token hash, once its id is known (makeViewLink). The owner's own row only.
export async function setViewLinkTokenHash(owner: Owner, id: number, tokenHash: string): Promise<void> {
  const rows = check(await db().from(TABLE).update({ token_hash: tokenHash }).eq("id", id).eq("user_id", owner.userId).select("id")) as unknown[] | null;
  if (!rows?.length) throw new Error("The new view link wasn't found");
}

// Ends one of the owner's links. Another owner's id matches nothing. True when a link was ended.
export async function revokeViewLinkRow(owner: Owner, id: number, now: string): Promise<boolean> {
  const rows = check(await db().from(TABLE).update({ revoked_at: now }).eq("id", id).eq("user_id", owner.userId).is("revoked_at", null).select("id")) as unknown[] | null;
  return (rows?.length ?? 0) > 0;
}

// Hide locations on or off for one of the owner's open links. Another owner's id, or an ended link,
// matches nothing. True when a link was changed.
export async function setViewLinkHideLocationsRow(owner: Owner, id: number, hide: boolean, now: string): Promise<boolean> {
  const rows = check(
    await db().from(TABLE).update({ hide_locations: hide }).eq("id", id).eq("user_id", owner.userId).is("revoked_at", null).gt("expires_at", now).select("id"),
  ) as unknown[] | null;
  return (rows?.length ?? 0) > 0;
}

// Ends every open link of the owner's: Sign out everywhere and Disconnect Tesla. Before the migration there
// are none to end.
export async function revokeAllViewLinks(owner: Owner, now: string): Promise<void> {
  try {
    check(await db().from(TABLE).update({ revoked_at: now }).eq("user_id", owner.userId).is("revoked_at", null));
  } catch (err) {
    if (!(err instanceof ViewLinksUnavailable)) throw err;
  }
}
