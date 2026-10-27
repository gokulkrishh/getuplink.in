// Owners' votes on the AI tips: "Useful" (1) or "Not useful" (-1), each against the kind of finding the tip
// came from (lib/ai-tips.ts), to learn which kinds of tip work. Pure, so the vote check and the Admin summary
// are tested (test/ai-tips.test.ts).
import { z } from "zod";
import type { TipScope } from "@/lib/ai-tips";

export const TIP_SCOPES = ["week", "drive_tips", "trip_tips", "charging", "charge", "battery"] as const satisfies readonly TipScope[];

export const tipVoteInput = z.object({
  scope: z.enum(TIP_SCOPES),
  // The page: the IST day's start, a drive's start or a charge's id.
  entity: z.string().regex(/^\d{1,15}$/),
  kind: z.string().regex(/^[A-Za-z0-9]{1,40}$/),
  tip: z.string().trim().min(1).max(400),
  // 0 takes a vote back.
  vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

export type TipVoteInput = z.infer<typeof tipVoteInput>;
export type Vote = 1 | -1;

// Where a vote was cast, for Admin.
export const SCOPE_LABELS: Record<TipScope, string> = {
  week: "Home",
  drive_tips: "Drive",
  trip_tips: "Trip",
  charging: "Charging",
  charge: "Charge",
  battery: "Battery",
};

// The owner's latest tips each way on one kind of page, for the prompt (lib/ai-tips.ts votesNote).
export type PastVotes = { useful: string[]; notUseful: string[] };

// The owner's net votes per finding kind on one kind of page (useful minus not useful), for the ranking.
export function netByKind(votes: { kind: string; vote: number }[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const v of votes) net[v.kind] = (net[v.kind] ?? 0) + (v.vote > 0 ? 1 : -1);
  return net;
}

export type KindSummary = { scope: string; kind: string; useful: number; notUseful: number; share: number; examples: { tip: string; vote: number }[] };

// Admin's view of the votes, every owner's: one row per page and finding kind, with the useful and not useful
// counts, the share useful and the latest few tips voted on. Votes come newest first. The kinds that need work
// come first (lowest share useful, then most votes against), those working well last.
export function summariseVotes(votes: { scope: string; kind: string; tip: string; vote: number }[], examples = 3): KindSummary[] {
  const rows = new Map<string, KindSummary>();
  for (const v of votes) {
    const key = `${v.scope}:${v.kind}`;
    const row = rows.get(key) ?? { scope: v.scope, kind: v.kind, useful: 0, notUseful: 0, share: 0, examples: [] };
    if (v.vote > 0) row.useful += 1;
    else row.notUseful += 1;
    if (row.examples.length < examples) row.examples.push({ tip: v.tip, vote: v.vote });
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, share: r.useful / (r.useful + r.notUseful) }))
    .sort((a, b) => a.share - b.share || b.notUseful - a.notUseful || b.useful - a.useful);
}

// "Energy use", "Cheaper nearby": a kind's name for Admin, from its code name.
export function kindLabel(kind: string): string {
  const words = kind.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
