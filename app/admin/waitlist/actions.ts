"use server";

import { revalidatePath, updateTag } from "next/cache";
import { type Decision, isDecision } from "@/lib/admin";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { adminOwner } from "@/lib/server/admin";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { maxUsers } from "@/lib/server/env";
import { decide, WAITLIST_TAG } from "@/lib/server/waitlist";

const REFUSED = "Not allowed.";

// One action for every decision, the decision and the account bound in by the button. Server actions are
// reachable by POST from anywhere, so this checks again, uncached, that the request comes from the admin:
// a current Tesla session whose user has the admin role. Then it checks what was bound in.
// For useActionState: returns the message to show, or null when done.
export async function decideAccount(decision: Decision, id: number, _previous: string | null, _form?: FormData): Promise<string | null> {
  const admin = await adminOwner();
  if (!admin) return REFUSED;
  if (!isDecision(decision) || !Number.isSafeInteger(id) || id <= 0) return REFUSED;
  if (DEMO) return "Demo mode: nothing changes.";
  try {
    const result = await decide(admin, id, decision);
    if (result === "full") return `All ${maxUsers()} places are used.`;
    if (result === "gone") return "Already decided. Reload to see it.";
  } catch (err) {
    console.error("Waitlist decision failed:", messageOf(err));
    return "Couldn't save that. Try again in a moment.";
  }
  updateTag(WAITLIST_TAG);
  updateTag(OWNER_DATA_TAG); // /admin's owner count
  revalidatePath("/admin/waitlist");
  return null;
}
