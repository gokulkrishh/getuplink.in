import type { Alert } from "@/lib/alerts";

// What's new: the entries, and the rules for Home's one card (welcome, news or the share card).
// Pure, so it's tested directly (test/whats-new.test.ts). The reads and writes are in lib/server/whats-new.ts.

// "card": a big feature, with a Home card, a bell line and a place on the page. "bell": a smaller addition,
// with a bell line and the page, never a Home card.
export type Show = "card" | "bell";

// "draft": written, shown to nobody. "admin": the admin only, to try it first. "owners": every owner.
export type Audience = "draft" | "admin" | "owners";

export type Entry = {
  // Starts with the date, so ids sort as strings.
  id: string;
  // YYYY-MM-DD, India time.
  date: string;
  title: string;
  text: string;
  more?: string;
  link: { label: string; href: string };
  audience: Audience;
  show: Show;
};

export const WHATS_NEW: Entry[] = [
  {
    id: "2026-11-20-guest-access",
    date: "2026-11-20",
    title: "Guest access",
    text: "Send someone a link to see your car for as long as you choose. You can hide places and end it any time.",
    more: "They don't need a Tesla account.",
    link: { label: "Try it", href: "/settings#guest-access" },
    audience: "draft",
    show: "card",
  },
];

// Only owners approved at or after this get the welcome card. Everyone approved before it already knows
// their way around, so they never see it.
export const WELCOME_SINCE = Date.parse("2026-10-31T00:00:00+05:30");

export type HomeCard = { kind: "welcome" } | { kind: "news"; entry: Entry; more: number } | { kind: "share" } | null;

const byNewest = (a: Entry, b: Entry) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

// What this reader may see, newest first. Drafts are never shown.
export function visibleEntries(entries: Entry[], admin: boolean): Entry[] {
  return entries.filter((e) => e.audience === "owners" || (e.audience === "admin" && admin)).sort(byNewest);
}

// What closing the welcome card or opening What's new stores as seen.
export function newestVisibleId(entries: Entry[], admin: boolean): string | null {
  return visibleEntries(entries, admin)[0]?.id ?? null;
}

const entryStart = (e: Entry) => Date.parse(`${e.date}T00:00:00+05:30`);

export type CardFacts = {
  entries: Entry[];
  admin: boolean;
  // When the owner was approved; null when unknown.
  approvedAt: number | null;
  welcomedAt: number | null;
  seenId: string | null;
  // Whether the share card is due today (lib/share-nudge.ts).
  shareDue: boolean;
  // False before 20261117120000_whats_new.sql: then neither welcome nor news can be stored, so neither shows.
  schemaReady: boolean;
};

// Every entry this owner has not seen yet, newest first: visible to them, past the seen marker, and dated
// after they joined, so a new owner isn't told about things that were already there. Nothing before
// 20261117120000_whats_new.sql (schemaReady false) or without a known approval date.
export function unseenEntries(f: CardFacts): Entry[] {
  const { approvedAt } = f;
  if (!f.schemaReady || approvedAt === null) return [];
  return visibleEntries(f.entries, f.admin).filter((e) => (f.seenId === null || e.id > f.seenId) && entryStart(e) > approvedAt);
}

// The bell's "Good to know" lines for them: one per unseen entry, either level.
export function whatsNewAlerts(f: CardFacts): Alert[] {
  return unseenEntries(f).map((e) => ({
    key: `whats-new-${e.id}`,
    kind: "info",
    icon: "new",
    title: e.title,
    detail: e.text,
    href: "/releases",
    since: `${e.date}T00:00:00+05:30`,
  }));
}

// Home's one card: welcome, then news, then the share card. News is for owners who joined before the entry's
// day, so a new owner isn't told about things that were already there; the newest unseen shows, with a count of
// the rest.
export function pickHomeCard(f: CardFacts & { now: number }): HomeCard {
  if (f.schemaReady && f.approvedAt !== null) {
    if (f.approvedAt >= WELCOME_SINCE && f.welcomedAt === null) return { kind: "welcome" };
    const fresh = unseenEntries(f).filter((e) => e.show === "card");
    if (fresh.length > 0) return { kind: "news", entry: fresh[0], more: fresh.length - 1 };
  }
  return f.shareDue ? { kind: "share" } : null;
}
