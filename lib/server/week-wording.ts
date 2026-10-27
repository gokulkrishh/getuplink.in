import "server-only";
import { createHash } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { PRICE_PER_TOKEN, WORDING_MODEL } from "@/lib/drive-wording";
import { messageOf } from "@/lib/errors";
import { checkWeekLine, quietWeek, WEEK_PROMPT_VERSION, type WeekFacts, weekFactsKey, weekRequest } from "@/lib/week-wording";
import { type Owner, ownerDb } from "./data/owner";

// Home's AI line on the last 7 days, written at most once a day and kept in drive_wording as scope 'week'
// (one row per owner, car and IST day). The page never waits for the model: with nothing stored for today,
// it shows no line and writes one after the response (after()); the next view shows it. Nothing is called
// in demo mode, without OPENROUTER_API_KEY, or for a week with nothing in it.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 15_000;
const MISSING = ["42P01", "PGRST205", "23514"];

const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || null;
const hash = (facts: WeekFacts) => createHash("sha256").update(weekFactsKey(facts)).digest("hex");

export type WeekKey = { vehicleId: string; day: number };
export type StoredWeekLine = { line: string | null; generate: boolean };

// Demo mode calls no model: a line in the same voice, made from the demo's own figures.
function demoLine(facts: WeekFacts): string | null {
  const t = facts.longestTrip;
  return t ? `The longest trip was on ${t.day}, at ${t.distance}${facts.costPerKwh ? `, and charging came to ${facts.costPerKwh}` : ""}.` : null;
}

// Today's stored line for these facts. Never throws.
export async function loadWeekLine(owner: Owner, key: WeekKey, facts: WeekFacts): Promise<StoredWeekLine> {
  if (quietWeek(facts)) return { line: null, generate: false };
  if (DEMO) return { line: demoLine(facts), generate: false };
  try {
    const { data, error } = await ownerDb(owner)
      .from("drive_wording")
      .select("facts_hash, wording, model")
      .eq("vehicle_id", key.vehicleId)
      .eq("drive_start", new Date(key.day).toISOString())
      .eq("scope", "week")
      .maybeSingle();
    if (error) {
      if (!MISSING.includes(error.code)) console.warn("Week line unavailable:", error.message);
      return { line: null, generate: false };
    }
    // Written today already: kept for the day even as the figures move, so the page isn't paid for on
    // every visit. It passed its checks when written.
    // A line from an older prompt or model is written again.
    if (data && (data.wording as { v?: unknown } | null)?.v === WEEK_PROMPT_VERSION && data.model === WORDING_MODEL) return { line: storedLine(data.wording), generate: false };
    return { line: null, generate: apiKey() !== null };
  } catch (err) {
    console.warn("Week line unavailable:", messageOf(err));
    return { line: null, generate: false };
  }
}

// A line stored earlier today passed its checks against that moment's figures; shown as it was.
function storedLine(wording: unknown): string | null {
  const line = (wording as { line?: unknown } | null)?.line;
  return typeof line === "string" ? line : null;
}

const writing = new Set<string>();

// Writes and stores today's line. Run after the response; never throws. A reply that fails its checks is
// stored as no line, so today isn't paid for twice.
export async function generateWeekLine(owner: Owner, key: WeekKey, facts: WeekFacts): Promise<void> {
  const token = apiKey();
  if (DEMO || !token || quietWeek(facts)) return;
  const id = `${owner.userId}:${key.vehicleId}:${key.day}`;
  if (writing.has(id)) return;
  writing.add(id);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Title": "Uplink" },
      body: JSON.stringify(weekRequest(facts)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("Week line not written: OpenRouter", res.status);
      return;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null } };
    const line = checkWeekLine(body.choices?.[0]?.message?.content ?? "", facts);
    const u = body.usage;
    const cost = typeof u?.cost === "number" ? u.cost : u?.prompt_tokens != null && u.completion_tokens != null ? u.prompt_tokens * PRICE_PER_TOKEN.input + u.completion_tokens * PRICE_PER_TOKEN.output : null;
    const { error } = await ownerDb(owner)
      .from("drive_wording")
      .upsert(
        { vehicle_id: key.vehicleId, drive_start: new Date(key.day).toISOString(), scope: "week", facts_hash: hash(facts), wording: { line, v: WEEK_PROMPT_VERSION }, model: WORDING_MODEL, cost_usd: cost, created_at: new Date().toISOString() },
        { onConflict: "user_id,vehicle_id,drive_start,scope" },
      );
    if (error && !MISSING.includes(error.code)) console.warn("Storing week line failed:", error.message);
  } catch (err) {
    console.warn("Week line not written:", messageOf(err));
  } finally {
    writing.delete(id);
  }
}

