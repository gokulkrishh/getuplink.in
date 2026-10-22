import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/session";
import { checkStations } from "@/lib/server/station-check";

export const maxDuration = 60;

// Every 15 minutes: names the charging station of a session in progress (lib/server/station-check.ts).
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await checkStations()) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Station check failed" }, { status: 500 });
  }
}
