// Jev's verdicts on the AI tips (lib/server/jev.ts), as kept in drive_wording.wording, and Admin's summary of
// them. On each stored tip, jev: Jev's verdict, or null when Jev was asked and didn't answer (tips written
// before Jev have no jev key). wording.jevBlocked: the tips Jev blocked, never shown. wording.jevAt: when Jev
// first checked this row's tips.
//
// p: Jev's probability that the tip says something the findings don't show. model: the dated model that
// answered. cost: in US dollars.
export type JevVerdict = { unsupported: boolean; p: number; at: string; model: string; cost: number };
export type BlockedTip = { kind: string; text: string; p: number; at: string };

// A drive_wording row with tips, as Admin reads it.
export type JevRow = { scope: string; wording: unknown; created_at: string };
// A vote on a tip, with when it was cast.
export type JevVote = { vote: number; updated_at: string };

export type ShownBlocked = { text: string; scope: string; p: number; at: string };
// Votes on tips in a stretch of time, and how many of them were not useful.
export type VoteRate = { votes: number; notUseful: number };
export type JevSummary = { checked: number; blocked: number; unavailable: number; tips: ShownBlocked[]; before: VoteRate; since: VoteRate; firstAt: string | null };

export const BLOCKED_SHOWN = 20;
// The not-useful rate is compared over this many days before Jev's first verdict against every day since.
export const BEFORE_DAYS = 30;
const DAY_MS = 86_400_000;

function rate(votes: JevVote[], from: number, to: number): VoteRate {
  const inside = votes.filter((v) => {
    const t = Date.parse(v.updated_at);
    return t >= from && t < to;
  });
  return { votes: inside.length, notUseful: inside.filter((v) => v.vote === -1).length };
}

// rows: the tip rows of the last 30 days. votes: votes since BEFORE_DAYS before firstAt. firstAt: Jev's first
// check on any tip, or null before it has checked one.
export function summariseJev(rows: JevRow[], votes: JevVote[], firstAt: string | null, now = Date.now()): JevSummary {
  const out: JevSummary = { checked: 0, blocked: 0, unavailable: 0, tips: [], before: { votes: 0, notUseful: 0 }, since: { votes: 0, notUseful: 0 }, firstAt };
  for (const row of rows) {
    const w = row.wording as { tips?: unknown; jevBlocked?: unknown } | null;
    for (const t of (Array.isArray(w?.tips) ? w.tips : []) as { text?: unknown; jev?: unknown }[]) {
      if (typeof t?.text !== "string" || !("jev" in t)) continue;
      out.checked++;
      if (t.jev === null || t.jev === undefined) out.unavailable++;
    }
    for (const b of (Array.isArray(w?.jevBlocked) ? w.jevBlocked : []) as Partial<BlockedTip>[]) {
      if (typeof b?.text !== "string" || typeof b.p !== "number") continue;
      out.checked++;
      out.blocked++;
      out.tips.push({ text: b.text, scope: row.scope, p: b.p, at: b.at ?? row.created_at });
    }
  }
  out.tips.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  out.tips = out.tips.slice(0, BLOCKED_SHOWN);
  if (firstAt) {
    const first = Date.parse(firstAt);
    out.before = rate(votes, first - BEFORE_DAYS * DAY_MS, first);
    out.since = rate(votes, first, now + 1);
  }
  return out;
}
