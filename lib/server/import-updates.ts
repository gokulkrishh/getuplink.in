import "server-only";
import { DEMO } from "@/lib/demo";
import { formatDate } from "@/lib/format";
import {
  chainImport,
  type HistoryEntry,
  type ImportState,
  parseImport,
  planImport,
  readSubmitted,
} from "@/lib/import-updates";
import type { VersionChange } from "./dashboard";
import { demoData, setDemoImported } from "./demo";
import { db } from "./supabase";
import { loadPrimaryVehicle } from "./telemetry";
import { check, UNIQUE_VIOLATION } from "./version-history";

// Imports go to the connected car, the one the dashboard and Stats show.
async function connectedVehicleId(): Promise<string | null> {
  return (await loadPrimaryVehicle())?.id ?? null;
}

async function loadHistory(): Promise<{ vehicleId: string | null; history: HistoryEntry[] }> {
  if (DEMO) {
    const history = demoData().history.map((h, i) => ({ ...h, id: i }));
    return { vehicleId: "demo", history };
  }
  const vehicleId = await connectedVehicleId();
  if (!vehicleId) return { vehicleId: null, history: [] };
  const history = await check(
    db()
      .from("version_history")
      .select("id, version, previous_version, detected_at, source")
      .eq("vehicle_id", vehicleId)
      .order("detected_at", { ascending: true })
      .limit(5000),
  );
  return { vehicleId, history: (history ?? []) as HistoryEntry[] };
}

const fail = (message: string, issues: string[] = []): ImportState => ({ status: "error", message, issues });
const NOT_TRACKED = "Uplink hasn't recorded your car's version yet. Import after the first check.";

// Parses an export or a typed list and checks it against the history. Nothing is saved.
export async function previewImport(text: string, { pasted }: { pasted: boolean }): Promise<ImportState> {
  const now = Date.now();
  const parsed = parseImport(text, now, { pasted });
  if (parsed.error) return fail(parsed.error, parsed.issues);
  const { vehicleId, history } = await loadHistory();
  if (!vehicleId || !history.some((h) => h.source === "tracked")) return fail(NOT_TRACKED);
  return { status: "preview", rows: planImport(parsed.updates, history), issues: parsed.issues };
}

const plural = (n: number) => `${n} ${n === 1 ? "update" : "updates"}`;

// Saves the previewed rows the browser sends back, after checking them again against the current history:
// only versions not in it yet, dated before tracking began, are inserted.
export async function saveImport(submitted: string): Promise<ImportState> {
  let value: unknown;
  try {
    value = JSON.parse(submitted);
  } catch {
    value = null;
  }
  const rows = readSubmitted(value, Date.now());
  if (!rows) return fail("Those updates can't be saved. Check the file again.");
  const { vehicleId, history } = await loadHistory();
  if (!vehicleId || !history.some((h) => h.source === "tracked")) return fail(NOT_TRACKED);
  const plan = planImport(rows, history);
  const { inserts, updates } = chainImport(plan, history);
  if (inserts.length === 0) return fail("Nothing new to import. These are all in your history already.");
  const range = `${formatDate(inserts[0].detected_at)} to ${formatDate(inserts[inserts.length - 1].detected_at)}`;
  const done: ImportState = { status: "done", message: `Imported ${plural(inserts.length)}, ${range}.` };

  if (DEMO) {
    const byId = new Map(updates.map((u) => [u.id, u.previous_version]));
    const kept = history
      .filter((h) => h.source === "imported")
      .map(({ id, ...h }) => ({ ...h, previous_version: byId.has(id!) ? byId.get(id!)! : h.previous_version }) as VersionChange);
    const added = inserts.map((r) => ({ ...r, available_at: null, odometer_km: null, source: "imported" }) as VersionChange);
    setDemoImported([...kept, ...added]);
    return done;
  }

  const { error } = await db()
    .from("version_history")
    .insert(inserts.map((r) => ({ ...r, vehicle_id: vehicleId, source: "imported" })));
  if (error?.code === UNIQUE_VIOLATION) return fail("Some of these were just saved. Check the file again.");
  if (error) throw new Error(error.message);
  // Earlier imported rows now follow a version from this import. Tracked rows are never changed.
  for (const u of updates) {
    await check(db().from("version_history").update({ previous_version: u.previous_version }).eq("id", u.id).eq("source", "imported"));
  }
  return done;
}

// Deletes the imported rows only; tracked history stays as it was.
export async function undoImport(): Promise<ImportState> {
  if (DEMO) {
    const count = demoData().history.filter((h) => h.source === "imported").length;
    setDemoImported([]);
    return { status: "done", message: `Removed ${plural(count)}.` };
  }
  const vehicleId = await connectedVehicleId();
  if (!vehicleId) return fail("No car connected.");
  const { count, error } = await db()
    .from("version_history")
    .delete({ count: "exact" })
    .eq("vehicle_id", vehicleId)
    .eq("source", "imported");
  if (error) throw new Error(error.message);
  return { status: "done", message: `Removed ${plural(count ?? 0)}.` };
}

// How many imported rows the connected car has, for Settings. Zero when it can't be read.
export async function countImported(): Promise<number> {
  if (DEMO) return demoData().history.filter((h) => h.source === "imported").length;
  try {
    const vehicleId = await connectedVehicleId();
    if (!vehicleId) return 0;
    const { count } = await db()
      .from("version_history")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("source", "imported");
    return count ?? 0;
  } catch {
    return 0;
  }
}
