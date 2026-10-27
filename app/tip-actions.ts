"use server";

import { updateTag } from "next/cache";
import { DEMO } from "@/lib/demo";
import { FEEDBACK_TAG } from "@/lib/server/feedback";
import { currentOwner } from "@/lib/server/auth";
import { saveTipVote } from "@/lib/server/tip-votes";
import { tipVoteInput } from "@/lib/tip-votes";

// The tips box's thumbs (components/home/week-tips.tsx). Reachable by POST from anywhere, so it checks the
// session and every field. Quiet either way: a vote that can't be kept isn't worth an error on the page.
export async function voteTip(raw: unknown): Promise<void> {
  if (DEMO) return;
  const owner = await currentOwner();
  if (!owner) return;
  const parsed = tipVoteInput.safeParse(raw);
  if (!parsed.success) return;
  await saveTipVote(owner, parsed.data);
  // Admin > Feedback lists the latest votes.
  updateTag(FEEDBACK_TAG);
}
