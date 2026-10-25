import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { pruneTelemetry } from "@/lib/server/retention";

export const maxDuration = 60;

// Once a day: deletes streamed readings past their keep (lib/telemetry-retention.ts).
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
    return NextResponse.json({ ok: true, ...(await pruneTelemetry()) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Retention failed" }, { status: 500 });
  }
}
