"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { checkNow } from "@/lib/server/poll";
import { loadSetup } from "@/lib/server/setup";

// "Check again": asks Tesla now (at most every 30 seconds per car, see loadSetup), then shows the answer.
// With no car known yet (a first sign-in whose check hasn't finished), it runs the check that finds them,
// itself limited to once per 5 minutes.
export async function checkAgain(): Promise<void> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  if (DEMO) return refresh();
  try {
    const view = await loadSetup(owner, { force: true });
    if (view.cars.length === 0) await checkNow(owner);
  } catch (err) {
    console.warn("Checking setup again failed:", messageOf(err));
  }
  refresh();
}
