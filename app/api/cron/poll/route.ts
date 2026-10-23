import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";
import { recordHealth } from "@/lib/server/stream-health";

export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  // The demo site has no car or database to poll.
  if (DEMO) return NextResponse.json({ ok: true, skipped: "demo" });
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await pollAll();
    // Feeds the status page's history; a failure here must not fail the poll.
    await recordHealth().catch((err) => console.warn("Recording health failed:", err));
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Poll failed" }, { status: 500 });
  }
}
