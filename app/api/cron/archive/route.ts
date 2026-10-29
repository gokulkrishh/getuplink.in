import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { archiveDrives } from "@/lib/server/drive-archive";

export const maxDuration = 300;

// Once a day, 2:30 AM IST, half an hour before retention deletes readings past their keep: stores every
// finished drive not yet archived, with slimmed readings, so trips outlive the readings
// (lib/server/drive-archive.ts).
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
    return NextResponse.json({ ok: true, ...(await archiveDrives()) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Archive failed" }, { status: 500 });
  }
}
