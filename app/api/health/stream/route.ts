import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/session";
import { recordResults, runHealthChecks } from "@/lib/server/stream-health";
import { assembleHealth } from "@/lib/stream-health";

export const maxDuration = 30;

// Called by an external bot every 15 minutes with `Authorization: Bearer $HEALTH_TOKEN`. Always 200
// once authorised: the bot reads `ok`. Nothing here returns a VIN, token or secret.
export async function GET(request: NextRequest) {
  const token = process.env.HEALTH_TOKEN;
  if (!token) return NextResponse.json({ error: "HEALTH_TOKEN not set" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checks = await runHealthChecks();
  // The bot's checks also feed the status page's history.
  await recordResults(checks).catch((err) => console.warn("Recording health failed:", err));
  return NextResponse.json(
    assembleHealth({
      now: checks.now,
      problems: checks.components.flatMap((c) => c.problems),
      lastReadingAt: checks.lastReadingAt,
      carLastOnlineAt: checks.carLastOnlineAt,
      synced: checks.synced,
      expiresAt: checks.expiresAt,
      teslaFetchedAt: checks.teslaFetchedAt,
    }),
  );
}
