"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { DEMO_SHARING_COOKIE, setSharing } from "@/lib/server/owners";

// Share with other owners, on /owners and in Settings. Server actions are reachable by POST from anywhere,
// so this re-checks the session and acts only on that account. Returns the error to show, or null.
export async function shareFigures(on: boolean): Promise<string | null> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  if (DEMO) {
    const jar = await cookies();
    if (on) jar.delete(DEMO_SHARING_COOKIE);
    else jar.set(DEMO_SHARING_COOKIE, "off", { path: "/", httpOnly: true, sameSite: "lax" });
  } else {
    try {
      await setSharing(owner, on === true);
    } catch (err) {
      console.error("Changing sharing failed:", messageOf(err));
      return on ? "Couldn't turn on sharing. Try again in a moment." : "Couldn't turn off sharing. Try again in a moment.";
    }
  }
  updateTag(OWNER_DATA_TAG);
  return null;
}
