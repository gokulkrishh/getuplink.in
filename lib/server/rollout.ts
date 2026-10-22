import "server-only";
import { DEMO } from "@/lib/demo";
import { buildRollout, GLOBAL_RELEASES, type Rollout, type RolloutChange } from "@/lib/rollout";
import { demoFleet } from "./demo";
import { missingEnv } from "./env";
import { db } from "./supabase";

export type RolloutPage = { kind: "ready"; rollout: Rollout } | { kind: "error"; message: string };

const PAGE = 1000; // PostgREST's default row cap per request

// Every version_history row across all cars, in pages of PAGE.
async function allChanges(): Promise<RolloutChange[]> {
  const rows: RolloutChange[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("version_history")
      .select("car:vehicle_id::text, version, previous:previous_version, at:detected_at, source")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as RolloutChange[]));
    if (data.length < PAGE) return rows;
  }
}

// /rollout's totals, pooled across every car in the database. Only the totals leave this function: vehicle
// ids are opaque keys inside buildRollout, and VINs are never read.
export async function loadRollout(): Promise<RolloutPage> {
  if (DEMO) {
    const fleet = demoFleet();
    const cars = fleet.vehicles.map((v) => ({ car: v.id, version: v.current_version }));
    const changes = fleet.history.map((h) => ({ car: h.vehicle_id, version: h.version, previous: h.previous_version, at: h.detected_at, source: h.source }));
    return { kind: "ready", rollout: buildRollout(cars, changes, fleet.globalReleases) };
  }
  try {
    const missing = missingEnv();
    if (missing.length) return { kind: "error", message: `Missing env vars: ${missing.join(", ")}` };
    // Every owner's cars count by default. The opt-out (phase 6, with per-owner settings) goes here: drop the
    // cars and rows of owners who turned it off before they reach buildRollout.
    const [vehicles, changes] = await Promise.all([db().from("vehicles").select("car:id::text, version:current_version"), allChanges()]);
    if (vehicles.error) throw new Error(vehicles.error.message);
    return { kind: "ready", rollout: buildRollout(vehicles.data as { car: string; version: string | null }[], changes, GLOBAL_RELEASES) };
  } catch (err) {
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
