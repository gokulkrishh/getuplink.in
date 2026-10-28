import "server-only";
import type { TipScope } from "@/lib/ai-tips";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { type KindSummary, netByKind, type PastVotes, summariseVotes, type TipVoteInput, type Vote } from "@/lib/tip-votes";
import { BEFORE_DAYS, type JevSummary, summariseJev } from "@/lib/jev-checks";
import { firstJevAt, jevCheckRows, recentTipVotes, tipVotesSince } from "./data/system";
import { type Owner, ownerDb } from "./data/owner";

// Owners' votes on the AI tips, in tip_votes (supabase/migrations/20261108130000_tip_votes.sql). Every read
// and write is quiet before that migration runs: no votes, and a vote that isn't kept.

const MISSING = ["42P01", "PGRST205", "23514", "42703", "PGRST204"];
// How many of the owner's latest tips each way the prompt is given.
const PAST_VOTES = 10;
// How many of the owner's latest votes on a kind of page count for the ranking.
const RANKING_VOTES = 200;

// Stores the vote, changes it, or (vote 0) takes it back. Never throws.
export async function saveTipVote(owner: Owner, input: TipVoteInput): Promise<void> {
  if (DEMO) return;
  try {
    const now = new Date().toISOString();
    const votes = ownerDb(owner).from("tip_votes");
    const { error } =
      input.vote === 0
        ? await votes.delete().eq("scope", input.scope).eq("entity", input.entity).eq("tip", input.tip)
        : await votes.upsert({ scope: input.scope, entity: input.entity, kind: input.kind, tip: input.tip, vote: input.vote, updated_at: now }, { onConflict: "user_id,scope,entity,tip" });
    if (error && !MISSING.includes(error.code)) console.warn("Storing a tip vote failed:", error.message);
  } catch (err) {
    console.warn("Storing a tip vote failed:", messageOf(err));
  }
}

// What the tips box needs: the owner's votes on this page's tips, by tip, and their net votes per finding kind
// on every page, for the ranking. Never throws.
export async function loadTipVotes(owner: Owner, scope: TipScope, entity: string): Promise<{ votes: Record<string, Vote>; net: Record<string, number> }> {
  const none = { votes: {}, net: {} };
  if (DEMO) return none;
  try {
    // Every page's votes: a kind of tip is the same kind wherever it shows (parked loss on Home and on
    // Battery), so a vote on one page moves it on the others too.
    const { data, error } = await ownerDb(owner).from("tip_votes").select("scope, entity, kind, tip, vote").order("updated_at", { ascending: false }).limit(RANKING_VOTES);
    if (error) {
      if (!MISSING.includes(error.code)) console.warn("Tip votes unavailable:", error.message);
      return none;
    }
    const rows = (data ?? []).map((r) => ({ scope: r.scope as string, entity: r.entity as string, kind: r.kind as string, tip: r.tip as string, vote: Number(r.vote) }));
    return {
      votes: Object.fromEntries(rows.filter((r) => r.scope === scope && r.entity === entity).map((r) => [r.tip, r.vote === 1 ? 1 : -1])),
      net: netByKind(rows),
    };
  } catch (err) {
    console.warn("Tip votes unavailable:", messageOf(err));
    return none;
  }
}

// The owner's latest tips each way on this kind of page, for the prompt. Never throws.
export async function pastTipVotes(owner: Owner, scope: TipScope): Promise<PastVotes> {
  const none = { useful: [], notUseful: [] };
  if (DEMO) return none;
  try {
    const read = (vote: Vote) => ownerDb(owner).from("tip_votes").select("tip").eq("scope", scope).eq("vote", vote).order("updated_at", { ascending: false }).limit(PAST_VOTES);
    const [up, down] = await Promise.all([read(1), read(-1)]);
    if (up.error || down.error) return none;
    return { useful: (up.data ?? []).map((r) => r.tip as string), notUseful: (down.data ?? []).map((r) => r.tip as string) };
  } catch {
    return none;
  }
}

// Admin's summary per page and kind (summariseVotes), from every owner's latest votes. Null before the
// migration runs or when the votes can't be read. Demo mode shows a few made-up votes, to preview the view.
export async function loadVoteSummary(limit: number): Promise<KindSummary[] | null> {
  if (DEMO) return summariseVotes(DEMO_VOTES);
  try {
    const votes = await recentTipVotes(limit);
    return votes && summariseVotes(votes);
  } catch (err) {
    console.warn("Tip votes unavailable:", messageOf(err));
    return null;
  }
}

// Admin's Jev checks (lib/jev-checks.ts summariseJev) over the last JEV_DAYS. Null when the tables can't be
// read. Demo mode shows a few made-up checks, to preview the view.
export const JEV_DAYS = 30;
const DAY_MS = 86_400_000;
export async function loadJevSummary(now = Date.now()): Promise<JevSummary | null> {
  if (DEMO) return demoJev(now);
  try {
    const [rows, firstAt] = await Promise.all([jevCheckRows(now - JEV_DAYS * DAY_MS), firstJevAt()]);
    if (!rows) return null;
    const votes = firstAt ? await tipVotesSince(Date.parse(firstAt) - BEFORE_DAYS * DAY_MS) : [];
    return summariseJev(rows, votes ?? [], firstAt, now);
  } catch (err) {
    console.warn("Jev checks unavailable:", messageOf(err));
    return null;
  }
}

function demoJev(now: number): JevSummary {
  const ago = (days: number) => new Date(now - days * DAY_MS).toISOString();
  const checked = (n: number) => Array.from({ length: n }, (_, k) => ({ kind: "energyUse", text: `Tip ${k}`, jev: { unsupported: false, p: 0.1, at: ago(2), model: "typesafe/jev-1.14-20261014", cost: 0 } }));
  const rows = [
    { scope: "week", created_at: ago(1), wording: { tips: [...checked(2), { kind: "shortTrips", text: "Tip", jev: null }], jevBlocked: [{ kind: "parkedLoss", text: "Your car lost 0.8 kWh a day while parked. Low tyre pressure adds to this, so check your tyres.", p: 0.97, at: ago(1) }] } },
    { scope: "drive_tips", created_at: ago(3), wording: { tips: checked(2), jevBlocked: [{ kind: "energyUse", text: "This drive used 168 Wh/km, 44% more than usual, because of the rain.", p: 0.93, at: ago(3) }] } },
    { scope: "charging", created_at: ago(6), wording: { tips: checked(3) } },
  ];
  const votes = [...Array.from({ length: 24 }, (_, k) => ({ vote: k < 9 ? -1 : 1, updated_at: ago(12 + (k % 10)) })), ...Array.from({ length: 15 }, (_, k) => ({ vote: k < 3 ? -1 : 1, updated_at: ago(1 + (k % 8)) }))];
  return summariseJev(rows, votes, ago(10), now);
}

const DEMO_VOTES = [
  { scope: "week", kind: "parkedLoss", tip: "Your car lost 0.8 kWh a day while parked, about ₹12.70 at ₹16.52/kWh. Turning off Sentry Mode or apps that wake the car can cut this.", vote: -1 },
  { scope: "week", kind: "shortTrips", tip: "2 of your 4 trips were under 5 km and used 137 Wh/km, against 124 Wh/km on longer trips. Combining errands into one trip can save energy.", vote: 1 },
  { scope: "week", kind: "parkedLoss", tip: "Parked, your car loses about 0.8 kWh a day. Sentry Mode and apps that wake the car add to it.", vote: -1 },
  { scope: "drive_tips", kind: "energyUse", tip: "This drive used 168 Wh/km, 44% more than your usual 117 Wh/km. Speed, quick starts and air conditioning can all raise energy use.", vote: 1 },
  { scope: "charging", kind: "stationPrices", tip: "Magenta Group works out cheapest at ₹20.65/kWh, while the Supercharger came to ₹24.00/kWh.", vote: 1 },
  { scope: "week", kind: "parkedLoss", tip: "The car lost 0.8 kWh a day while parked, costing ₹12.70 a day.", vote: 1 },
];
