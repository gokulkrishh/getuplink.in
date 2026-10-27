"use server";

import { updateTag } from "next/cache";
import { DEMO } from "@/lib/demo";
import { FEEDBACK_TAG } from "@/lib/server/feedback";
import { currentOwner } from "@/lib/server/auth";
import { saveTipVote } from "@/lib/server/tip-votes";
import { replaceTip } from "@/lib/server/ai-tips";
import type { Tip } from "@/lib/ai-tips";
import { z } from "zod";
import { tipVoteInput } from "@/lib/tip-votes";

// Where the tips stand, for swapping one voted down (see replaceTip): the car and the tips' time.
const swapInput = z.object({ vehicleId: z.string().regex(/^\d{1,20}$/), at: z.number().int().positive() });

// The tips box's thumbs (components/home/week-tips.tsx). Reachable by POST from anywhere, so it checks the
// session and every field. Quiet either way: a vote that can't be kept isn't worth an error on the page.
// A "Not useful" vote with `swap` returns another tip in its place when there is one to write.
export async function voteTip(raw: unknown, swap?: unknown): Promise<Tip | null> {
  if (DEMO) return null;
  const owner = await currentOwner();
  if (!owner) return null;
  const parsed = tipVoteInput.safeParse(raw);
  if (!parsed.success) return null;
  await saveTipVote(owner, parsed.data);
  // Admin > Feedback lists the latest votes.
  updateTag(FEEDBACK_TAG);
  const where = swapInput.safeParse(swap);
  if (parsed.data.vote !== -1 || !where.success) return null;
  return replaceTip(owner, parsed.data.scope, where.data.vehicleId, where.data.at, parsed.data.kind);
}
