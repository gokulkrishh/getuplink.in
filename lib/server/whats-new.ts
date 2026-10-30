import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Alert } from "@/lib/alerts";
import { DEMO, demoScenario } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { type CardFacts, type Entry, type HomeCard, newEntryIds, newestVisibleId, pickHomeCard, seenUpTo, visibleEntries, WHATS_NEW, whatsNewAlerts } from "@/lib/whats-new";
import { asOwner, type Owner } from "./data/owner";
import { MissingSchema } from "./data/usage";
import { closeWelcome, markSeen, whatsNewOf } from "./data/whats-new";
import { DEMO_ENTRIES, DEMO_OLD_OWNER } from "./demo/whats-new";

// Home's welcome and release dialogs, the bell's What's new lines and the page's list (lib/whats-new.ts has the
// rules). Every failure here means no dialog and no line: a missing column, a read error.
//
// Demo copies have no database. The scenarios "welcome" and "news" (UPLINK_DEMO_SCENARIO) show the dialogs;
// closing one lasts for the browser session. Other scenarios show neither.
export const DEMO_WELCOMED_COOKIE = "uplink-demo-welcomed";
export const DEMO_SEEN_COOKIE = "uplink-demo-whats-new-seen";

export const entriesFor = (): Entry[] => (DEMO ? DEMO_ENTRIES : WHATS_NEW);

async function demoFacts(): Promise<Omit<CardFacts, "admin" | "shareDue">> {
  const jar = await cookies();
  const scenario = demoScenario();
  const welcomed = jar.get(DEMO_WELCOMED_COOKIE) !== undefined;
  if (scenario === "welcome") return { entries: [], approvedAt: Date.now(), welcomedAt: welcomed ? 1 : null, seenId: null, schemaReady: true };
  if (scenario === "news") return { entries: DEMO_ENTRIES, approvedAt: DEMO_OLD_OWNER, welcomedAt: 1, seenId: jar.get(DEMO_SEEN_COOKIE)?.value ?? null, schemaReady: true };
  return { entries: [], approvedAt: null, welcomedAt: null, seenId: null, schemaReady: false };
}

// The owner's row, read once per render scope however many parts ask for it. By user, not by the owner
// object, which React's cache would compare by reference. Only for showing: the writes read the row afresh.
const rowFor = cache((userId: number, sub: string) => whatsNewOf(asOwner(userId, sub)));

// The facts for this owner, or schemaReady false when they can't be read.
async function factsOf(owner: Owner, admin: boolean): Promise<Omit<CardFacts, "shareDue">> {
  if (DEMO) return { ...(await demoFacts()), admin };
  const none = { entries: [], admin, approvedAt: null, welcomedAt: null, seenId: null, schemaReady: false };
  try {
    const row = await rowFor(owner.userId, owner.sub);
    if (!row) return none;
    return { entries: WHATS_NEW, admin, approvedAt: row.approvedAt, welcomedAt: row.welcomedAt, seenId: row.seen, schemaReady: true };
  } catch (err) {
    if (!(err instanceof MissingSchema)) console.warn("What's new skipped:", messageOf(err));
    return none;
  }
}

// Home's card, as a check on whether the share card is due: the owner's row is read while Home loads, so the
// card is known before the first paint.
export async function homeCardCheck(owner: Owner, admin: boolean): Promise<(shareDue: boolean, now: number) => HomeCard> {
  const facts = await factsOf(owner, admin);
  return (shareDue, now) => pickHomeCard({ ...facts, shareDue, now });
}

// The bell's lines. Never throws.
export async function whatsNewBell(owner: Owner, admin: boolean): Promise<Alert[]> {
  return whatsNewAlerts({ ...(await factsOf(owner, admin)), shareDue: false });
}

// The page: every visible entry, the ids that were new to them when they opened it (they get a dot), and the
// id to mark seen on opening (null when nothing is new to them).
export async function whatsNewPage(owner: Owner, admin: boolean): Promise<{ entries: Entry[]; markId: string | null; newIds: string[] }> {
  const entries = visibleEntries(entriesFor(), admin);
  const facts = await factsOf(owner, admin);
  const newest = newestVisibleId(entriesFor(), admin);
  return { entries, markId: newest !== null && (facts.seenId === null || newest > facts.seenId) ? newest : null, newIds: newEntryIds({ ...facts, shareDue: false }) };
}

// Closing the welcome tour. Before the migration, nothing to store, and the tour wasn't shown anyway.
export async function closeWelcomeCard(owner: Owner, admin: boolean, now: number): Promise<void> {
  if (DEMO) {
    (await cookies()).set(DEMO_WELCOMED_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
    return;
  }
  await closeWelcome(owner, newestVisibleId(WHATS_NEW, admin), new Date(now).toISOString());
}

// Opening the page (no `upTo`): the newest visible entry is seen. Closing the release dialog: `upTo`, the
// newest entry it showed, only if it is one this reader can see (seenUpTo). Forward only, in a demo too.
export async function markWhatsNewSeen(owner: Owner, admin: boolean, upTo?: unknown): Promise<void> {
  const id = seenUpTo(entriesFor(), admin, upTo);
  if (DEMO) {
    const jar = await cookies();
    const seen = jar.get(DEMO_SEEN_COOKIE)?.value;
    if (id && (!seen || id > seen)) jar.set(DEMO_SEEN_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
    return;
  }
  await markSeen(owner, id);
}
