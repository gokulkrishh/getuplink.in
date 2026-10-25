import { connection, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { currentOwner } from "@/lib/server/auth";
import { ownerDb } from "@/lib/server/data/owner";
import { recentReleaseNotes } from "@/lib/server/data/system";

// Owner-only (proxy.ts requires a session for /api/*): the raw data Uplink has stored from the owner's
// Tesla, for checking what the Fleet API actually returns. Tokens are never included.
export async function GET() {
  await connection();
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = ownerDb(owner);
  const [vehicles, snapshots, notes, runs] = await Promise.all([
    scope.from("vehicles").select("id, display_name, last_state, current_version, last_seen_at, last_polled_at"),
    scope
      .from("snapshots")
      .select("vehicle_id, polled_at, state, car_version, update_status, update_version, error, raw")
      .not("raw", "is", null)
      .order("polled_at", { ascending: false })
      .limit(5),
    recentReleaseNotes(10),
    scope.from("poll_runs").select("started_at, finished_at, ok, vehicles_seen, error").order("started_at", { ascending: false }).limit(10),
  ]);

  const body = {
    note: "Raw vehicle_state is what Tesla's vehicle_data?endpoints=vehicle_state returned at that check.",
    vehicles: vehicles.data ?? vehicles.error?.message,
    latest_online_snapshots: snapshots.data ?? snapshots.error?.message,
    release_notes: notes.data ?? notes.error?.message,
    recent_checks: runs.data ?? runs.error?.message,
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
