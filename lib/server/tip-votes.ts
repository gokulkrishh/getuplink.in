import "server-only";
import type { TipScope } from "@/lib/ai-tips";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { type KindSummary, netByKind, type PastVotes, summariseVotes, type TipVoteInput, type Vote } from "@/lib/tip-votes";
import { recentTipVotes } from "./data/system";
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
// on this kind of page, for the ranking. Never throws.
export async function loadTipVotes(owner: Owner, scope: TipScope, entity: string): Promise<{ votes: Record<string, Vote>; net: Record<string, number> }> {
  const none = { votes: {}, net: {} };
  if (DEMO) return none;
  try {
    const { data, error } = await ownerDb(owner).from("tip_votes").select("entity, kind, tip, vote").eq("scope", scope).order("updated_at", { ascending: false }).limit(RANKING_VOTES);
    if (error) {
      if (!MISSING.includes(error.code)) console.warn("Tip votes unavailable:", error.message);
      return none;
    }
    const rows = (data ?? []).map((r) => ({ entity: r.entity as string, kind: r.kind as string, tip: r.tip as string, vote: Number(r.vote) }));
    return {
      votes: Object.fromEntries(rows.filter((r) => r.entity === entity).map((r) => [r.tip, r.vote === 1 ? 1 : -1])),
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

const DEMO_VOTES = [
  { scope: "week", kind: "parkedLoss", tip: "Your car lost 0.8 kWh a day while parked, about ₹12.70 at ₹16.52/kWh. Turning off Sentry Mode or apps that wake the car can cut this.", vote: -1 },
  { scope: "week", kind: "shortTrips", tip: "2 of your 4 trips were under 5 km and used 137 Wh/km, against 124 Wh/km on longer trips. Combining errands into one trip can save energy.", vote: 1 },
  { scope: "week", kind: "parkedLoss", tip: "Parked, your car loses about 0.8 kWh a day. Sentry Mode and apps that wake the car add to it.", vote: -1 },
  { scope: "drive_tips", kind: "energyUse", tip: "This drive used 168 Wh/km, 44% more than your usual 117 Wh/km. Speed, quick starts and air conditioning can all raise energy use.", vote: 1 },
  { scope: "charging", kind: "stationPrices", tip: "Magenta Group works out cheapest at ₹20.65/kWh, while the Supercharger came to ₹24.00/kWh.", vote: 1 },
  { scope: "week", kind: "parkedLoss", tip: "The car lost 0.8 kWh a day while parked, costing ₹12.70 a day.", vote: 1 },
];
