import "server-only";
import { DEMO } from "@/lib/demo";
import { archiveCarDrives } from "@/lib/drive-archive";
import type { Drive } from "@/lib/drives";
import { type Owner, ownerDb } from "./data/owner";
import { accountOwners, lastArchivedDrive, saveArchivedDrives } from "./data/system";
import { loadReadingsByField } from "./telemetry-window";
import { loadPrimaryVehicle } from "./telemetry";

// The run has its route's 300 s; stop starting cars well before that. What's left goes tomorrow.
const BUDGET_MS = 240_000;

// Archives one owner's finished drives that aren't yet (see archiveCarDrives), for their first car.
export async function archiveOwnerDrives(owner: Owner, now: number): Promise<number> {
  const car = await loadPrimaryVehicle(owner);
  if (!car) return 0;
  return archiveCarDrives(
    {
      read: (fields, from, to) => loadReadingsByField(owner, car.vin, fields, new Date(from).toISOString(), new Date(to).toISOString()),
      last: () => lastArchivedDrive(car.vin),
      save: saveArchivedDrives,
    },
    car.vin,
    now,
  );
}

export type ArchiveResult = { owners: number; drives: number; done: boolean; skipped?: string };

// Once a day (app/api/cron/archive), before retention deletes readings past their keep: every account's
// new finished drives. A shared car is archived by whichever of its users comes first; the rest find
// nothing new. One account failing doesn't stop the others.
export async function archiveDrives(now = Date.now(), clock = Date.now): Promise<ArchiveResult> {
  if (DEMO) return { owners: 0, drives: 0, done: true, skipped: "demo" };
  const started = clock();
  const owners = await accountOwners();
  let drives = 0;
  let done = 0;
  for (const owner of owners) {
    if (clock() - started > BUDGET_MS) return { owners: done, drives, done: false };
    try {
      drives += await archiveOwnerDrives(owner, now);
    } catch (err) {
      console.warn(`Archiving drives for user ${owner.userId} failed:`, err instanceof Error ? err.message : err);
    }
    done++;
  }
  return { owners: done, drives, done: true };
}

// The owner's archived drives that started before `before`, newest first: the trips older than the
// readings kept. Empty in demo mode (the generator's readings cover any time) and when the archive can't
// be read.
export async function loadArchivedDrives(owner: Owner, vin: string, before: number): Promise<Drive[]> {
  if (DEMO) return [];
  const { data, error } = await ownerDb(owner)
    .archivedDrives("drive")
    .eq("vin", vin)
    .lt("start_at", new Date(before).toISOString())
    .order("start_at", { ascending: false });
  if (error) {
    console.warn("Archived drives unavailable:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.drive as Drive);
}
