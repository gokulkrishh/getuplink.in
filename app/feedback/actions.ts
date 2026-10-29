"use server";

import { updateTag } from "next/cache";
import { DEMO } from "@/lib/demo";
import { currentOwner } from "@/lib/server/auth";
import { FEEDBACK_TAG, feedbackInput, type SaveResult, saveFeedback } from "@/lib/server/feedback";

// The feedback button's send. Reachable by POST from anywhere, so it checks the session and every field.
export async function sendFeedback(raw: unknown): Promise<SaveResult> {
  if (DEMO) return { ok: true };
  const owner = await currentOwner();
  if (!owner) return { ok: false, error: "Sign in again to send feedback." };
  const parsed = feedbackInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick what it's about, then write a line." };
  const result = await saveFeedback(owner, parsed.data, Date.now());
  if (result.ok) updateTag(FEEDBACK_TAG);
  return result;
}
