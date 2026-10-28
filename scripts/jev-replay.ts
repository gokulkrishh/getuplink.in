// Replays Jev (lib/server/jev.ts) over the AI tips stored in the last DAYS days, and joins its verdicts with
// owners' votes on the same tips, to see whether Jev would block the tips owners found not useful. Reads the
// database only; writes nothing. Each tip costs one Jev call (about $0.00002).
//
//   bun --conditions=react-server --env-file=.env.local scripts/jev-replay.ts
//
// Prints no secrets, VINs or ids. Station, town and area names in a tip are shown as [place 1] and so on.
import { createClient } from "@supabase/supabase-js";
import type { Finding } from "@/lib/ai-tips";
import { BLOCK_FROM, checkTip, hidePlaces, JEV_MODEL, placeTokens } from "@/lib/server/jev";

const DAYS = 60;
const AT_ONCE = 6;
const TIP_SCOPES = ["week", "drive_tips", "trip_tips", "charging", "charge", "battery"];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.OPENROUTER_API_KEY) throw new Error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENROUTER_API_KEY (run with --env-file=.env.local).");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = { user_id: number; scope: string; wording: { tips?: { kind: string; text: string }[]; sent?: Finding[] } | null };
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
const rows = await db.from("drive_wording").select("user_id, scope, wording").in("scope", TIP_SCOPES).gte("created_at", since).limit(10_000);
if (rows.error) throw new Error(`Reading tips failed: ${rows.error.message}`);
const votes = await db.from("tip_votes").select("user_id, tip, vote").limit(10_000);
if (votes.error) throw new Error(`Reading tip votes failed: ${votes.error.message}`);
// Joined by tip text: the same text twice is the same tip.
// A text voted both ways (the same tip on two days) is 2.
const voteOf = new Map<string, number>();
for (const v of votes.data ?? []) {
  const was = voteOf.get(v.tip as string);
  voteOf.set(v.tip as string, was === undefined || was === Number(v.vote) ? Number(v.vote) : 2);
}
const stored = new Set((rows.data as Row[]).flatMap((r) => (r.wording?.tips ?? []).map((t) => t.text)));
const unmatched = (votes.data ?? []).filter((v) => !stored.has(v.tip as string));

// Station, town and area names, hidden in what's printed as they are from Jev.
const redact = (text: string, sent: Finding[]) => hidePlaces(text, placeTokens(sent));

const jobs = (rows.data as Row[]).flatMap((r) => (Array.isArray(r.wording?.sent) ? (r.wording.tips ?? []).map((t) => ({ ...t, scope: r.scope, sent: r.wording!.sent!, vote: voteOf.get(t.text) ?? 0 })) : []));
const results: { scope: string; text: string; vote: number; p: number | null }[] = [];
for (let k = 0; k < jobs.length; k += AT_ONCE) {
  const batch = jobs.slice(k, k + AT_ONCE);
  const verdicts = await Promise.all(batch.map((j) => checkTip({ findings: j.sent, tip: j.text })));
  batch.forEach((j, m) => results.push({ scope: j.scope, text: redact(j.text, j.sent), vote: j.vote, p: verdicts[m]?.p ?? null }));
}

const blocks = (r: (typeof results)[number]) => r.p !== null && r.p >= BLOCK_FROM;
const line = (label: string, list: typeof results) => console.log(`${label.padEnd(22)} ${String(list.length).padStart(5)} ${String(list.filter(blocks).length).padStart(12)}`);
console.log(`Jev replay: ${JEV_MODEL}, tips stored in the last ${DAYS} days, blocks from p >= ${BLOCK_FROM}`);
console.log(`Tips checked: ${results.length} (Jev didn't answer ${results.filter((r) => r.p === null).length})`);
console.log(`Jev would block: ${results.filter(blocks).length}`);
console.log("");
console.log(`${"Tips".padEnd(22)} ${"count".padStart(5)} ${"would block".padStart(12)}`);
line("Voted not useful", results.filter((r) => r.vote === -1));
line("Voted useful", results.filter((r) => r.vote === 1));
line("Voted both ways", results.filter((r) => r.vote === 2));
line("Not voted", results.filter((r) => r.vote === 0));
console.log(`Votes on tips not stored in the last ${DAYS} days (can't be replayed): ${unmatched.length}, ${unmatched.filter((v) => Number(v.vote) === -1).length} of them not useful`);
console.log("");
console.log("Tips Jev would block:");
for (const r of results.filter(blocks).sort((a, b) => (b.p ?? 0) - (a.p ?? 0))) console.log(`- p ${r.p!.toFixed(2)} · ${r.scope} · ${r.vote === 1 ? "useful" : r.vote === -1 ? "not useful" : r.vote === 2 ? "both ways" : "not voted"}: ${r.text}`);
const p = results.flatMap((r) => (r.p === null ? [] : [r.p])).sort((a, b) => a - b);
if (p.length > 0) console.log(`\nJev's p across all tips: lowest ${p[0].toFixed(2)}, middle ${p[Math.floor(p.length / 2)].toFixed(2)}, highest ${p.at(-1)!.toFixed(2)}`);
