import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { runOwners } from "@/lib/server/owners";

export const maxDuration = 300;

// Once a day, 3:30 AM IST: works out each shared car's days for the Owners page, then the totals across
// them (lib/server/owners.ts runOwners).
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  // The demo site has no database.
  if (DEMO) return NextResponse.json({ ok: true, skipped: "demo" });
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runOwners()) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Owners run failed" }, { status: 500 });
  }
}
