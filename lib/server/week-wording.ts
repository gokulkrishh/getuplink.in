import "server-only";
import { createHash } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { PRICE_PER_TOKEN, WORDING_MODEL } from "@/lib/drive-wording";
import { messageOf } from "@/lib/errors";
import { checkWeekTips, quietWeek, WEEK_PROMPT_VERSION, type WeekFacts, weekFactsKey, weekRequest } from "@/lib/week-wording";
import { type Owner, ownerDb } from "./data/owner";

// Home's AI tips on the last 7 days, written at most once a day and kept in drive_wording as scope 'week'
// (one row per owner, car and IST day). The page never waits for the model: with nothing stored for today,
// it shows no tips and writes them after the response (after()); the next view shows it. Nothing is called
// in demo mode, without OPENROUTER_API_KEY, or for a week with nothing in it.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 15_000;
const RETRY_MS = 3_600_000;
// Replies that fail their checks are asked again, up to this many times in one go.
const TRIES = 3;
const MISSING = ["42P01", "PGRST205", "23514"];

const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || null;
const hash = (facts: WeekFacts) => createHash("sha256").update(weekFactsKey(facts)).digest("hex");

export type WeekKey = { vehicleId: string; day: number };
export type StoredWeekTips = { tips: string[]; generate: boolean };

// Demo mode calls no model: tips in the same voice, made from the demo's own figures.
function demoTips(facts: WeekFacts): string[] {
  return [
    facts.efficiency && facts.efficiencyWeekBefore && `Efficiency was ${facts.efficiency}, against ${facts.efficiencyWeekBefore} the week before. Steady speeds keep it low.`,
    facts.shortTrips > 0 && `${facts.shortTrips} of your ${facts.trips} trips were short. A short trip uses more energy per km, so combining errands helps.`,
    facts.costPerKwh && `Charging came to ${facts.costPerKwh} this week. Charging at home on AC usually costs less per kWh than fast charging.`,
  ].filter((t): t is string => Boolean(t));
}

// Today's stored tips for these facts. Never throws.
export async function loadWeekTips(owner: Owner, key: WeekKey, facts: WeekFacts): Promise<StoredWeekTips> {
  if (quietWeek(facts)) return { tips: [], generate: false };
  if (DEMO) return { tips: demoTips(facts), generate: false };
  try {
    const { data, error } = await ownerDb(owner)
      .from("drive_wording")
      .select("facts_hash, wording, model, created_at")
      .eq("vehicle_id", key.vehicleId)
      .eq("drive_start", new Date(key.day).toISOString())
      .eq("scope", "week")
      .maybeSingle();
    if (error) {
      if (!MISSING.includes(error.code)) console.warn("Week tips unavailable:", error.message);
      return { tips: [], generate: false };
    }
    // Written today already: kept for the day even as the figures move, so the page isn't paid for on
    // every visit. They passed their checks when written. A day with no tips (every reply failed its checks)
    // tries again after RETRY_MS. Tips from an older prompt or model are written again.
    if (data && (data.wording as { v?: unknown } | null)?.v === WEEK_PROMPT_VERSION && data.model === WORDING_MODEL) {
      const tips = storedTips(data.wording);
      if (tips.length > 0 || Date.now() - Date.parse(data.created_at) < RETRY_MS) return { tips, generate: false };
    }
    return { tips: [], generate: apiKey() !== null };
  } catch (err) {
    console.warn("Week tips unavailable:", messageOf(err));
    return { tips: [], generate: false };
  }
}

// Tips stored earlier today passed their checks against that moment's figures; shown as they were.
function storedTips(wording: unknown): string[] {
  const tips = (wording as { tips?: unknown } | null)?.tips;
  return Array.isArray(tips) ? tips.filter((t): t is string => typeof t === "string") : [];
}

const writing = new Set<string>();

// Writes and stores today's tips. Run after the response; never throws. When no tip in any try passes its
// checks, none are stored, and loadWeekTips asks again an hour later.
export async function generateWeekTips(owner: Owner, key: WeekKey, facts: WeekFacts): Promise<void> {
  const token = apiKey();
  if (DEMO || !token || quietWeek(facts)) return;
  const id = `${owner.userId}:${key.vehicleId}:${key.day}`;
  if (writing.has(id)) return;
  writing.add(id);
  try {
    let tips: string[] = [];
    let cost = 0;
    for (let k = 0; k < TRIES && tips.length === 0; k++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Title": "Uplink" },
        body: JSON.stringify(weekRequest(facts)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn("Week tips not written: OpenRouter", res.status);
        return;
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null } };
      tips = checkWeekTips(body.choices?.[0]?.message?.content ?? "", facts);
      const u = body.usage;
      cost += typeof u?.cost === "number" ? u.cost : u?.prompt_tokens != null && u.completion_tokens != null ? u.prompt_tokens * PRICE_PER_TOKEN.input + u.completion_tokens * PRICE_PER_TOKEN.output : 0;
    }
    const { error } = await ownerDb(owner)
      .from("drive_wording")
      .upsert(
        { vehicle_id: key.vehicleId, drive_start: new Date(key.day).toISOString(), scope: "week", facts_hash: hash(facts), wording: { tips, v: WEEK_PROMPT_VERSION }, model: WORDING_MODEL, cost_usd: cost, created_at: new Date().toISOString() },
        { onConflict: "user_id,vehicle_id,drive_start,scope" },
      );
    if (error && !MISSING.includes(error.code)) console.warn("Storing week tips failed:", error.message);
  } catch (err) {
    console.warn("Week tips not written:", messageOf(err));
  } finally {
    writing.delete(id);
  }
}

