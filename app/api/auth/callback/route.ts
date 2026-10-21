import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, STATE_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";
import { exchangeCode } from "@/lib/server/tesla";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const home = new URL("/", request.url);

  const fail = (reason: string) => {
    home.searchParams.set("error", reason);
    const res = NextResponse.redirect(home);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };

  if (params.get("error")) return fail(params.get("error_description") ?? params.get("error")!);
  if (!code || !expected || !safeEqual(state, expected)) return fail("Invalid OAuth state, try connecting again");

  try {
    await exchangeCode(code);
  } catch (err) {
    console.error(err);
    return fail("Could not exchange the Tesla authorization code");
  }

  // Record a first snapshot right away rather than waiting for the cron.
  await pollAll().catch((err) => console.error(err));

  const res = NextResponse.redirect(home);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  return res;
}
