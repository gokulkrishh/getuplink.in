import { connection, NextResponse } from "next/server";
import { currentReader } from "@/lib/server/auth";
import { VIEWER_HEADERS } from "@/lib/view-cookie";

// Whether this browser's view link is still open, and whether it hides locations (the owner can change that
// while it's open), for the viewer's open page (components/view-link-watch.tsx).
// Reads only the link and its owner's row: never Tesla, Google or anything else. Public in proxy.ts: with no
// viewer cookie, or an ended link, it answers { open: false }.
export async function GET() {
  await connection();
  let open = false;
  let hideLocations: boolean | undefined;
  try {
    const viewer = (await currentReader())?.viewer;
    open = Boolean(viewer);
    hideLocations = viewer?.hideLocations;
  } catch (err) {
    // A database hiccup isn't an ended link: the page stays until the next check.
    console.warn("Checking a view link failed:", (err as Error).message);
    return NextResponse.json({ open: true, unsure: true }, { headers: VIEWER_HEADERS });
  }
  return NextResponse.json(open ? { open, hideLocations } : { open }, { headers: VIEWER_HEADERS });
}
