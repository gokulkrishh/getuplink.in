import { NextResponse } from "next/server";
import { parseQuery, parseSessionToken } from "@/lib/place-suggestions";
import { currentOwner } from "@/lib/server/auth";
import { searchPlaces } from "@/lib/server/place-suggestions";
import { parsePoint } from "@/lib/user-places";

// "Name this place" search: Google Places Autocomplete for what the owner typed, near the pin. Owner-only
// (proxy.ts requires a session for /api/*, and this checks again). POST, so the query and the spot stay out
// of URLs and request logs. The sheet waits for a pause in typing and 2 characters before it asks. Nothing
// from the reply is stored or cached: Google's terms (docs/place-names.md).
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 2000;

export async function POST(request: Request) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw.length <= MAX_BODY ? JSON.parse(raw) : null;
    if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {}
  const query = parseQuery(body.q);
  const point = parsePoint(body.lat, body.lng);
  const token = parseSessionToken(body.token);
  if (!query || !point || !token) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  return NextResponse.json(await searchPlaces(query, point, token), { headers: NO_STORE });
}
