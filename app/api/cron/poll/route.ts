import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { checkDue } from "@/lib/server/poll";
import { recordIfStale } from "@/lib/server/status";

export const maxDuration = 60;

// Longer than the health bot's 15 minutes, so this defers to the bot while it runs.
const HEALTH_EVERY_MS = 20 * 60_000;

// Every 15 minutes: checks the users who are due (lib/server/poll.ts checkDue).
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
    const result = await checkDue();
    // Feeds the status page's history, unless the health bot or a visitor recorded a check in the last
    // 20 minutes: each check asks Tesla twice, so one every run would add 192 requests a day. Warn-only.
    await recordIfStale(HEALTH_EVERY_MS);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Poll failed" }, { status: 500 });
  }
}
