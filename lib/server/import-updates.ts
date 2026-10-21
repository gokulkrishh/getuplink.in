import "server-only";
import {
  chainRows,
  checkRows,
  describeIssues,
  IMPORT_MAX_CHARS,
  type ImportState,
  parseUpdates,
} from "@/lib/import-updates";
import { formatDate } from "@/lib/format";
import { db } from "./supabase";

type Result<T> = PromiseLike<{ data: T; error: { message: string } | null }>;

async function check<T>(query: Result<T>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

const fail = (message: string, issues: string[] = []): ImportState => ({ status: "error", message, issues, count: 0 });

type HistoryRow = { id: number; version: string; previous_version: string | null; detected_at: string; source: string };

// Checks pasted updates against one car's history and, when `confirmed`, saves them as 'imported' rows.
// Tracked rows are never changed, except that the oldest one learns which version came before it.
export async function importPastUpdates(vehicleId: string, text: string, confirmed: boolean): Promise<ImportState> {
  if (!/^\d+$/.test(vehicleId)) return fail("Pick a car.");
  if (!text.trim()) return fail("Paste your updates or choose a file first.");
  if (text.length > IMPORT_MAX_CHARS) return fail("That's too much text. Paste only the update list.");

  const parsed = parseUpdates(text);
  if (parsed.rows.length === 0) return fail("No updates found.", describeIssues(parsed.issues));

  const history = (await check(
    db()
      .from("version_history")
      .select("id, version, previous_version, detected_at, source")
      .eq("vehicle_id", vehicleId)
      .order("detected_at", { ascending: true }),
  )) as HistoryRow[];
  if (history.some((h) => h.source === "imported")) {
    return fail("Delete the imported updates first, then import the full list again.");
  }
  const firstTracked = history[0] ?? null;

  const checked = checkRows(parsed.rows, {
    now: Date.now(),
    firstTrackedAt: firstTracked?.detected_at ?? null,
    knownVersions: new Set(history.map((h) => h.version)),
  });
  const issues = describeIssues([...parsed.issues, ...checked.issues].sort((a, b) => a.line - b.line));
  const rows = checked.rows;
  if (rows.length === 0) return fail("None of these can be imported.", issues);

  const count = rows.length;
  const noun = count === 1 ? "update" : "updates";
  if (!confirmed) {
    const range = `${formatDate(`${rows[0].date}T12:00:00Z`)} to ${formatDate(`${rows[count - 1].date}T12:00:00Z`)}`;
    return { status: "preview", message: `${count} ${noun} ready to import, from ${range}.`, issues, count };
  }

  await check(
    db()
      .from("version_history")
      .insert(chainRows(rows).map((row) => ({ ...row, vehicle_id: vehicleId, source: "imported" }))),
  );
  // The oldest tracked row was "already installed when tracking began"; now we know what it replaced.
  if (firstTracked && firstTracked.previous_version === null) {
    await check(
      db()
        .from("version_history")
        .update({ previous_version: rows[count - 1].version })
        .eq("id", firstTracked.id)
        .eq("source", "tracked")
        .is("previous_version", null),
    );
  }
  return { status: "done", message: `Imported ${count} ${noun}.`, issues, count };
}

// Deletes every imported row and hands each car's oldest tracked row back its empty previous version.
export async function removeImportedUpdates(): Promise<number> {
  const imported = (await check(
    db().from("version_history").select("vehicle_id, version").eq("source", "imported"),
  )) as { vehicle_id: number; version: string }[];
  if (imported.length === 0) return 0;

  const byVehicle = new Map<number, Set<string>>();
  for (const row of imported) byVehicle.set(row.vehicle_id, (byVehicle.get(row.vehicle_id) ?? new Set()).add(row.version));

  for (const [vehicleId, versions] of byVehicle) {
    const first = (await check(
      db()
        .from("version_history")
        .select("id, previous_version")
        .eq("vehicle_id", vehicleId)
        .eq("source", "tracked")
        .order("detected_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    )) as { id: number; previous_version: string | null } | null;
    if (first?.previous_version && versions.has(first.previous_version)) {
      await check(db().from("version_history").update({ previous_version: null }).eq("id", first.id).eq("source", "tracked"));
    }
  }
  await check(db().from("version_history").delete().eq("source", "imported"));
  return imported.length;
}

export type ImportCar = { id: string; name: string; imported: number };

// Cars for the import forms, with how many imported updates each already has.
export async function loadImportCars(): Promise<ImportCar[]> {
  const [vehicles, imported] = await Promise.all([
    db().from("vehicles").select("id:id::text, display_name, vin").order("created_at"),
    db().from("version_history").select("vehicle_id").eq("source", "imported"),
  ]);
  if (vehicles.error || imported.error) return [];
  const counts = new Map<string, number>();
  for (const row of imported.data as { vehicle_id: number }[]) counts.set(String(row.vehicle_id), (counts.get(String(row.vehicle_id)) ?? 0) + 1);
  return (vehicles.data as { id: string; display_name: string | null; vin: string | null }[]).map((v) => ({
    id: v.id,
    name: v.display_name ?? v.vin ?? "Your car",
    imported: counts.get(v.id) ?? 0,
  }));
}
