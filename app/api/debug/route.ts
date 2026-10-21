import { connection, NextResponse } from "next/server";
import { db } from "@/lib/server/supabase";

// Owner-only (proxy.ts requires a session for /api/*): the raw data Uplink has stored from Tesla,
// for checking what the Fleet API actually returns. Tokens are never included.
export async function GET() {
  await connection();
  const [vehicles, snapshots, notes, runs] = await Promise.all([
    db().from("vehicles").select("id, display_name, last_state, current_version, last_seen_at, last_polled_at"),
    db()
      .from("snapshots")
      .select("vehicle_id, polled_at, state, car_version, update_status, update_version, error, raw")
      .not("raw", "is", null)
      .order("polled_at", { ascending: false })
      .limit(5),
    db().from("release_notes").select("version, fetched_at, notes, raw").order("fetched_at", { ascending: false }).limit(10),
    db().from("poll_runs").select("started_at, finished_at, ok, vehicles_seen, error").order("started_at", { ascending: false }).limit(10),
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
