import "server-only";
import { createHash } from "node:crypto";
import { checkTips, demoTips, type Finding, type Tip, type TipSurface, tipsKey, tipsRequest } from "@/lib/ai-tips";
import { DEMO } from "@/lib/demo";
import { PRICE_PER_TOKEN, WORDING_MODEL } from "@/lib/drive-wording";
import { messageOf } from "@/lib/errors";
import { type Owner, ownerDb } from "./data/owner";
import { pastTipVotes } from "./tip-votes";

// AI tips on every page that has them (lib/ai-tips.ts has the prompt and the checks), kept in drive_wording:
// one row per owner, car, time and scope. The time is the IST day's start for tips written once a day (Home's
// week, Stats > Charging) and the drive's or charge's start for tips about one of them. The page never waits
// for the model: with nothing stored, it shows no tips and writes them after the response (after()); the next
// view shows them. Nothing is called in demo mode (code lines stand in), without OPENROUTER_API_KEY, or with
// no findings.
//
// A write claims the row first, with no tips. A claim that can't be stored (the table or its scope isn't
// there yet) stops before the model is paid for, and a second request while one is writing sees the claim.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 15_000;
// A claim or a day with no tips (every reply failed its checks, or the call failed) is tried again after this.
const RETRY_MS = 3_600_000;
// Replies that fail their checks are asked again, up to this many times in one go.
const TRIES = 3;
// The table isn't there yet (42P01, PGRST205) or its scope check doesn't allow this scope (23514).
const MISSING = ["42P01", "PGRST205", "23514"];

const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || null;
const hash = (surface: TipSurface, sent: Finding[]) => createHash("sha256").update(tipsKey(surface, sent)).digest("hex");

// at: the IST day's start (daily: kept for the day as the figures move), or a drive's or charge's start
// (written again when its findings change).
export type TipsKey = { vehicleId: string; at: number; daily: boolean };
export type StoredTips = { tips: Tip[]; generate: boolean };

// The stored tips for these findings. Never throws.
export async function loadTips(owner: Owner, surface: TipSurface, key: TipsKey, sent: Finding[]): Promise<StoredTips> {
  if (sent.length === 0) return { tips: [], generate: false };
  if (DEMO) return { tips: demoTips(sent), generate: false };
  try {
    const { data, error } = await ownerDb(owner)
      .from("drive_wording")
      .select("facts_hash, wording, model, created_at")
      .eq("vehicle_id", key.vehicleId)
      .eq("drive_start", new Date(key.at).toISOString())
      .eq("scope", surface.scope)
      .maybeSingle();
    if (error) {
      if (!MISSING.includes(error.code)) console.warn("Tips unavailable:", error.message);
      return { tips: [], generate: false };
    }
    // Written for this prompt and model (and, for one drive or charge, these findings): shown as written,
    // since they passed their checks then. A row with no tips (a claim, or every reply failed) is tried
    // again after RETRY_MS.
    const v = (data?.wording as { v?: unknown } | null)?.v;
    if (data && v === surface.version && data.model === WORDING_MODEL && (key.daily || data.facts_hash === hash(surface, sent))) {
      const tips = storedTips(data.wording);
      if (tips.length > 0 || Date.now() - Date.parse(data.created_at) < RETRY_MS) return { tips, generate: false };
    }
    return { tips: [], generate: apiKey() !== null };
  } catch (err) {
    console.warn("Tips unavailable:", messageOf(err));
    return { tips: [], generate: false };
  }
}

function storedTips(wording: unknown): Tip[] {
  const tips = (wording as { tips?: unknown } | null)?.tips;
  return Array.isArray(tips) ? tips.filter((t): t is Tip => typeof t?.kind === "string" && typeof t?.text === "string") : [];
}

const writing = new Set<string>();

// Writes and stores the tips. Run after the response; never throws.
export async function generateTips(owner: Owner, surface: TipSurface, key: TipsKey, sent: Finding[]): Promise<void> {
  const token = apiKey();
  if (DEMO || !token || sent.length === 0) return;
  const id = `${owner.userId}:${key.vehicleId}:${key.at}:${surface.scope}`;
  if (writing.has(id)) return;
  writing.add(id);
  const store = (tips: Tip[], cost: number | null) =>
    ownerDb(owner)
      .from("drive_wording")
      .upsert(
        {
          vehicle_id: key.vehicleId,
          drive_start: new Date(key.at).toISOString(),
          scope: surface.scope,
          facts_hash: hash(surface, sent),
          wording: { tips, v: surface.version },
          model: WORDING_MODEL,
          cost_usd: cost,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,vehicle_id,drive_start,scope" },
      );
  try {
    const claim = await store([], null);
    if (claim.error) {
      if (!MISSING.includes(claim.error.code)) console.warn("Tips not written:", claim.error.message);
      return;
    }
    // The owner's votes on earlier tips here steer which kind to write.
    const votes = await pastTipVotes(owner, surface.scope);
    let tips: Tip[] = [];
    let cost = 0;
    for (let k = 0; k < TRIES && tips.length === 0; k++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Title": "Uplink" },
        body: JSON.stringify(tipsRequest(surface, sent, votes)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn("Tips not written: OpenRouter", res.status);
        break;
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null } };
      tips = checkTips(body.choices?.[0]?.message?.content ?? "", sent, surface);
      const u = body.usage;
      cost += typeof u?.cost === "number" ? u.cost : u?.prompt_tokens != null && u.completion_tokens != null ? u.prompt_tokens * PRICE_PER_TOKEN.input + u.completion_tokens * PRICE_PER_TOKEN.output : 0;
    }
    // With no tips the claim's time is kept, so the next try waits RETRY_MS from it.
    if (tips.length === 0) return;
    const { error } = await store(tips, cost);
    if (error && !MISSING.includes(error.code)) console.warn("Storing tips failed:", error.message);
  } catch (err) {
    console.warn("Tips not written:", messageOf(err));
  } finally {
    writing.delete(id);
  }
}
