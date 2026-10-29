import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { runOwners } from "@/lib/server/owners";
import { runShareNudges } from "@/lib/server/share-nudge";

export const maxDuration = 300;
// The share card's decisions start no new owner after this, leaving room for the ones under way (Jev's 3s
// timeout and an owner's reads) inside maxDuration.
const NUDGE_DEADLINE_MS = 240_000;

// Once a day, 3:30 AM IST: works out each shared car's days for the Owners page, then the totals across
// them (lib/server/owners.ts runOwners). Then, with what time is left, the share card's daily decision for
// owners who don't share (lib/server/share-nudge.ts); it fails on its own, never the owners run.
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  // The demo site has no database.
  if (DEMO) return NextResponse.json({ ok: true, skipped: "demo" });
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  let owners;
  try {
    owners = await runOwners();
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Owners run failed" }, { status: 500 });
  }
  const shareCard = await runShareNudges(started + NUDGE_DEADLINE_MS).catch((err) => {
    console.error(err);
    return { failed: 1 };
  });
  return NextResponse.json({ ok: true, ...owners, shareCard });
}
