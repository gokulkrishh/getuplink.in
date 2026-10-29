import "server-only";
import { readAllRows } from "@/lib/paging";
import { db } from "@/lib/server/supabase";
import { asOwner, type Owner } from "./owner";
import { APPROVED } from "./system";
import { MissingSchema } from "./usage";

// The share card's columns on users (20261114120000_share_nudge.sql). Before that migration each of these
// throws MissingSchema, and the callers carry on with no card (lib/server/share-nudge.ts).

const MISSING = ["42P01", "PGRST205", "42703", "PGRST204"];

function fail(error: { code?: string; message: string }): never {
  if (error.code && MISSING.includes(error.code)) throw new MissingSchema(error.message);
  throw new Error(error.message);
}

export type NudgeRow = { sharing: boolean; dismissals: number; dismissedAt: number | null; stoppedAt: number | null; showFrom: number | null; showUntil: number | null };

const COLUMNS = "id, tesla_sub, share_with_owners, share_nudge_dismissals, share_nudge_dismissed_at, share_nudge_show_from, share_nudge_show_until, share_stopped_at";
const time = (v: unknown) => (typeof v === "string" ? Date.parse(v) : null);
const toRow = (u: Record<string, unknown>): NudgeRow => ({
  sharing: u.share_with_owners === true,
  dismissals: Number(u.share_nudge_dismissals ?? 0),
  dismissedAt: time(u.share_nudge_dismissed_at),
  stoppedAt: time(u.share_stopped_at),
  showFrom: time(u.share_nudge_show_from),
  showUntil: time(u.share_nudge_show_until),
});

export async function nudgeOf(owner: Owner): Promise<NudgeRow | null> {
  const { data, error } = await db().from("users").select(COLUMNS).eq("id", owner.userId).maybeSingle();
  if (error) fail(error);
  return data ? toRow(data as Record<string, unknown>) : null;
}

// Not now: one more dismissal, when, and the window closed.
export async function saveDismissal(owner: Owner, dismissals: number, at: string): Promise<void> {
  const { error } = await db()
    .from("users")
    .update({ share_nudge_dismissals: dismissals, share_nudge_dismissed_at: at, share_nudge_show_from: null, share_nudge_show_until: null })
    .eq("id", owner.userId);
  if (error) fail(error);
}

// Every approved account that doesn't share: the nightly decision's candidates, before the rest of the rules.
export async function nudgeCandidates(): Promise<(NudgeRow & { owner: Owner })[]> {
  const { data, error } = await readAllRows((from, to) =>
    db().from("users").select(COLUMNS).eq("status", APPROVED).eq("share_with_owners", false).order("id").range(from, to),
  );
  if (error) fail(error);
  return (data as Record<string, unknown>[]).map((u) => ({ ...toRow(u), owner: asOwner(Number(u.id), u.tesla_sub as string) }));
}

// The nightly decision: a window for a yes, none for a no or no answer.
export async function saveNudgeWindow(owner: Owner, window: { from: string; until: string } | null): Promise<void> {
  const { error } = await db()
    .from("users")
    .update({ share_nudge_show_from: window?.from ?? null, share_nudge_show_until: window?.until ?? null })
    .eq("id", owner.userId);
  if (error) fail(error);
}

// Sharing turned on or off (lib/server/owners.ts setSharing): either way the owner has answered, so any window
// closes, and off is kept so they're never asked again.
export async function saveShareAnswer(owner: Owner, on: boolean, at: string): Promise<void> {
  const patch = on ? { share_nudge_show_from: null, share_nudge_show_until: null } : { share_nudge_show_from: null, share_nudge_show_until: null, share_stopped_at: at };
  const { error } = await db().from("users").update(patch).eq("id", owner.userId);
  if (error) fail(error);
}
