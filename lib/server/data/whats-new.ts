import "server-only";
import { db } from "@/lib/server/supabase";
import type { Owner } from "./owner";
import { MissingSchema } from "./usage";

// What's new's columns on users (20261117120000_whats_new.sql). Before that migration each of these throws
// MissingSchema, and the callers carry on with no dialog and no bell line (lib/server/whats-new.ts).

const MISSING = ["42P01", "PGRST205", "42703", "PGRST204"];

function fail(error: { code?: string; message: string }): never {
  if (error.code && MISSING.includes(error.code)) throw new MissingSchema(error.message);
  throw new Error(error.message);
}

export type WhatsNewRow = { approvedAt: number | null; welcomedAt: number | null; seen: string | null };

const time = (v: unknown) => (typeof v === "string" ? Date.parse(v) : null);

export async function whatsNewOf(owner: Owner): Promise<WhatsNewRow | null> {
  const { data, error } = await db().from("users").select("approved_at, welcomed_at, whats_new_seen").eq("id", owner.userId).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const u = data as Record<string, unknown>;
  return { approvedAt: time(u.approved_at), welcomedAt: time(u.welcomed_at), seen: typeof u.whats_new_seen === "string" ? u.whats_new_seen : null };
}

// The marker only moves forward: ids start with their date, so a larger id is a newer entry. Compared here,
// not in SQL, because the database's text order may differ from this one. The update is guarded by the value
// just read, so two taps at once can't move it back. A guard that no longer matches writes nothing.
async function advance(owner: Owner, seen: string | null, id: string | null): Promise<void> {
  if (id === null || (seen !== null && id <= seen)) return;
  const query = db().from("users").update({ whats_new_seen: id }).eq("id", owner.userId);
  const { error } = await (seen === null ? query.is("whats_new_seen", null) : query.eq("whats_new_seen", seen));
  if (error) fail(error);
}

// The owner opened Release notes or closed the release dialog.
export async function markSeen(owner: Owner, id: string | null): Promise<void> {
  const row = await whatsNewOf(owner);
  if (!row) return;
  await advance(owner, row.seen, id);
}

// The welcome tour closed: welcomed now, and everything up to the newest entry counts as seen, so a new owner
// is never shown older news. Two writes: the welcome on its own, so a marker moved in between by another tap
// can't drop it, then the marker.
export async function closeWelcome(owner: Owner, newestId: string | null, at: string): Promise<void> {
  const row = await whatsNewOf(owner);
  if (!row) return;
  if (row.welcomedAt === null) {
    const { error } = await db().from("users").update({ welcomed_at: at }).eq("id", owner.userId).is("welcomed_at", null);
    if (error) fail(error);
  }
  await advance(owner, row.seen, newestId);
}
