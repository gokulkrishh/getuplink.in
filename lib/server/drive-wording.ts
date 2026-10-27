import "server-only";
import { createHash } from "node:crypto";
import { DEMO } from "@/lib/demo";
import type { DriveFacts, DriveWords } from "@/lib/drive-facts";
import { checkWording, factsKey, PRICE_PER_TOKEN, WORDING_MODEL, wordingRequest } from "@/lib/drive-wording";
import { messageOf } from "@/lib/errors";
import { type Owner, ownerDb } from "./data/owner";
import { demoWording } from "./demo/wording";

// The drive page's AI wording, written once per drive and kept in drive_wording (see
// lib/drive-wording.ts for the prompt and the checks). A page view never waits for it: with nothing stored,
// the page shows the code sentences and schedules generateDriveWording with after(); the next view shows
// the AI's. Nothing is called before the table exists, without OPENROUTER_API_KEY, or in demo mode.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 15_000;
// Postgres 42P01 / PostgREST PGRST205: the migration hasn't run.
const MISSING_TABLE = ["42P01", "PGRST205"];

// Which page the wording is for: a trip (drives with short stops between) and its first leg start at the
// same time but say different things, so the scope tells them apart.
export type WordingKey = { vehicleId: string; start: number; scope: "trip" | "drive" };

export const factsHash = (facts: DriveFacts) => createHash("sha256").update(factsKey(facts)).digest("hex");

const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || null;

export type StoredWording = {
  // The lines that passed their checks, or null: show the code sentences.
  words: DriveWords | null;
  // Whether to write them now (after the response): nothing stored for these facts, the table is there,
  // and there is a key.
  generate: boolean;
};

// The stored wording for these facts. Never throws: on any problem the page shows its code sentences.
export async function loadDriveWording(owner: Owner, key: WordingKey, facts: DriveFacts): Promise<StoredWording> {
  if (DEMO) return { words: demoWording(facts, key.start), generate: false };
  try {
    const { data, error } = await ownerDb(owner)
      .from("drive_wording")
      .select("facts_hash, wording")
      .eq("vehicle_id", key.vehicleId)
      .eq("drive_start", new Date(key.start).toISOString())
      .eq("scope", key.scope)
      .maybeSingle();
    if (error) {
      if (!MISSING_TABLE.includes(error.code)) console.warn("Drive wording unavailable:", error.message);
      return { words: null, generate: false };
    }
    // Wording for other facts (a usual that moved, a new prompt) is out of date: write it again.
    if (data && data.facts_hash === factsHash(facts)) return { words: checkWording(data.wording, facts), generate: false };
    return { words: null, generate: apiKey() !== null };
  } catch (err) {
    console.warn("Drive wording unavailable:", messageOf(err));
    return { words: null, generate: false };
  }
}

export type ModelReply = { ok: true; words: DriveWords; costUsd: number | null; ms: number } | { ok: false; error: string; ms: number };

// One call to OpenRouter for these facts. The facts are all it sends (see lib/drive-facts.ts): figures and
// clock times, no place, car or account.
export async function writeWording(facts: DriveFacts, key = apiKey()): Promise<ModelReply> {
  const began = Date.now();
  if (!key) return { ok: false, error: "no OPENROUTER_API_KEY", ms: 0 };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Uplink" },
      body: JSON.stringify(wordingRequest(facts)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - began;
    if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}`, ms };
    const body = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null };
    };
    const words = checkWording(body.choices?.[0]?.message?.content ?? "", facts);
    if (words === null) return { ok: false, error: "reply didn't parse", ms };
    const usage = body.usage;
    const costUsd =
      typeof usage?.cost === "number"
        ? usage.cost
        : usage?.prompt_tokens != null && usage.completion_tokens != null
          ? usage.prompt_tokens * PRICE_PER_TOKEN.input + usage.completion_tokens * PRICE_PER_TOKEN.output
          : null;
    return { ok: true, words, costUsd, ms };
  } catch (err) {
    return { ok: false, error: messageOf(err), ms: Date.now() - began };
  }
}

// Drives being written now, so a quick reload doesn't pay for a second call.
const writing = new Set<string>();

// Writes and stores the wording for one drive. Run after the response (after()); never throws. A reply
// whose lines all fail their checks is stored too (as no lines), so the same facts aren't paid for again;
// a failed call stores nothing and is tried on the next view.
export async function generateDriveWording(owner: Owner, key: WordingKey, facts: DriveFacts): Promise<void> {
  if (DEMO || !apiKey()) return;
  const id = `${owner.userId}:${key.vehicleId}:${key.start}:${key.scope}`;
  if (writing.has(id)) return;
  writing.add(id);
  try {
    const reply = await writeWording(facts);
    if (!reply.ok) {
      console.warn("Drive wording not written:", reply.error);
      return;
    }
    const { error } = await ownerDb(owner)
      .from("drive_wording")
      .upsert(
        {
          vehicle_id: key.vehicleId,
          drive_start: new Date(key.start).toISOString(),
          scope: key.scope,
          facts_hash: factsHash(facts),
          wording: reply.words,
          model: WORDING_MODEL,
          cost_usd: reply.costUsd,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,vehicle_id,drive_start,scope" },
      );
    if (error && !MISSING_TABLE.includes(error.code)) console.warn("Storing drive wording failed:", error.message);
  } catch (err) {
    console.warn("Drive wording not written:", messageOf(err));
  } finally {
    writing.delete(id);
  }
}
