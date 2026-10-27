"use server";

import { updateTag } from "next/cache";
import { DEMO } from "@/lib/demo";
import { isAdmin } from "@/lib/server/admin";
import type { FeedbackStatus } from "@/lib/server/data/system";
import { FEEDBACK_TAG, markFeedbackRow, STATUSES } from "@/lib/server/feedback";

// Marks one message read, done, or new again. Reachable by POST from anywhere, so it checks the admin itself.
export async function markFeedback(id: number, status: FeedbackStatus): Promise<{ error: string | null }> {
  if (DEMO) return { error: null };
  if (!(await isAdmin())) return { error: "Only the admin can do this." };
  if (!Number.isSafeInteger(id) || id <= 0 || !STATUSES.includes(status)) return { error: "That message can't be marked." };
  try {
    await markFeedbackRow(id, status);
  } catch (err) {
    console.warn("Marking feedback failed:", (err as Error).message);
    return { error: "Couldn't save that. Try again." };
  }
  updateTag(FEEDBACK_TAG);
  return { error: null };
}
