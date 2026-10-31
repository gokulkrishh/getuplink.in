import type { Alert } from "@/lib/alerts";

// What's new: the entries, and the rules for what Home shows: the welcome tour, the release dialog or the share card.
// Pure, so it's tested directly (test/whats-new.test.ts). The reads and writes are in lib/server/whats-new.ts.

// "dialog": a big feature or visible change, opened over Home like the welcome tour, with a bell line and a place
// on the page. "bell": a smaller addition, with a bell line and the page, never a dialog.
export type Show = "dialog" | "bell";

// What an entry is, as the page's list names it under the title.
export const KINDS = ["New feature", "Improvement"] as const;
export type Kind = (typeof KINDS)[number];


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
  // Uplink's version this shipped in, like "0.2". The page groups entries under it.
  version: string;
  // A screenshot of the feature, a file in public/whats-new/. Every entry that is not a draft needs one
  // (test/whats-new.test.ts checks the file exists). Width and height are the file's own, so the page
  // holds the space before it loads.
  image?: { src: string; alt: string; width: number; height: number };
  kind: Kind;
  audience: Audience;
  show: Show;
};

export const WHATS_NEW: Entry[] = [
  {
    id: "2026-10-31-trip-route-names",
    date: "2026-10-31",
    title: "Where each trip went",
    text: "A trip's page now says where it went under its title. A place you picked from Google Maps shows by its own name there.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-swipe-to-close",
    date: "2026-10-31",
    title: "Swipe down to close",
    text: "On a phone, you can now swipe down to close the tour, feedback and questions in Settings. Naming a place opens from the bottom of the screen too.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-software-tab",
    date: "2026-10-31",
    title: "Software, with the India rollout",
    text: "Updates is now called Software, under Car. The India rollout map and versions are on the same page.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-last-drive-line",
    date: "2026-10-31",
    title: "Last drive on the car card",
    text: "Home shows your last drive and charge as a line under your car. Each one opens its page.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-guest-link-sheet",
    date: "2026-10-31",
    title: "Guest links, tidier",
    text: "In Settings, Create guest link opens a sheet with the form. Your open links still show under Guest access.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-efficiency-sentence",
    date: "2026-10-31",
    title: "Efficiency in one line",
    text: "Driving sums up your energy use in one sentence. The bars by AC setting and outside temperature are a tap away.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-chart-download",
    date: "2026-10-31",
    title: "Save a chart as an image",
    text: "Charts now have a download button. It saves the chart as a picture you can keep or post.",
    version: "0.2",
    image: { src: "/whats-new/chart-download.webp", alt: "The Distance chart with its download button at the top right.", width: 1360, height: 661 },
    kind: "New feature",
    audience: "owners",
    show: "dialog",
  },
  {
    id: "2026-10-31-charging-habits",
    date: "2026-10-31",
    title: "Charging, tidier",
    text: "Charging opens on the month. Where you start and stop, and when you plug in, now sit under Your charging habits.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-charge-energy-added",
    date: "2026-10-31",
    title: "Energy added while charging",
    text: "While your car charges, Home and the Car page show how much energy it has taken in so far.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-31-battery-health-chart",
    date: "2026-10-31",
    title: "One battery health chart",
    text: "Battery shows how much a full charge holds in one chart, with Tesla's own figure beside it. It also shows when your car was awake.",
    version: "0.2",
    kind: "Improvement",
    audience: "draft",
    show: "bell",
  },
  {
    id: "2026-10-30-guest-access",
    date: "2026-10-30",
    title: "Guest access",
    text: "Send someone a link to see your car for as long as you choose. You can hide places and end it any time.",
    more: "They don't need a Tesla account.",
    version: "0.2",
    image: { src: "/whats-new/guest-access.webp", alt: "Settings, Guest access: who it's for, how long it lasts, and Create guest link.", width: 1360, height: 574 },
    kind: "New feature",
    audience: "owners",
    show: "dialog",
  },
];

export type HomeCard = { kind: "welcome" } | { kind: "release"; entries: Entry[]; total: number } | { kind: "share" } | null;

const byNewest = (a: Entry, b: Entry) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

// What this reader may see, newest first. Drafts are never shown.
export function visibleEntries(entries: Entry[], admin: boolean): Entry[] {
  return entries.filter((e) => e.audience === "owners" || (e.audience === "admin" && admin)).sort(byNewest);
}

// What closing the welcome tour or opening Release notes stores as seen.
export function newestVisibleId(entries: Entry[], admin: boolean): string | null {
  return visibleEntries(entries, admin)[0]?.id ?? null;
}

// What to mark seen. No id (opening the page): the newest visible entry. An id (closing the release dialog,
// the newest entry it showed): that id, but only when it is an entry this reader can see, so a newer entry
// the dialog never showed keeps its bell line. Anything else marks nothing.
export function seenUpTo(entries: Entry[], admin: boolean, id: unknown): string | null {
  if (id === undefined) return newestVisibleId(entries, admin);
  return typeof id === "string" && visibleEntries(entries, admin).some((e) => e.id === id) ? id : null;
}

// Entries grouped by version, in the order given (newest first), for the page.
export function byVersion(entries: Entry[]): { version: string; entries: Entry[] }[] {
  const groups: { version: string; entries: Entry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.version === e.version) last.entries.push(e);
    else groups.push({ version: e.version, entries: [e] });
  }
  return groups;
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

// The entries to mark with a blue dot on Release notes: the ones this owner hadn't seen when they opened the page
// (the same ones the bell lists). Read before opening marks them seen, so the dots last for that visit.
export function newEntryIds(f: CardFacts): string[] {
  return unseenEntries(f).map((e) => e.id);
}

// The bell's "Good to know" lines for them: one per unseen entry, either level.
export function whatsNewAlerts(f: CardFacts): Alert[] {
  return unseenEntries(f).map((e) => ({
    key: `whats-new-${e.id}`,
    kind: "info",
    icon: "new",
    title: e.title,
    detail: e.text,
    href: "/release-notes",
    // An entry has a date, not a time: the bell would print midnight as if it were known.
    since: null,
  }));
}

// Home's one card: welcome, then the release dialog, then the share card. The release dialog is for owners who
// joined before the entry's day, so a new owner isn't told about things that were already there. It holds the
// newest unseen dialog entries, at most RELEASE_STEPS, with how many there are in all.
export const RELEASE_STEPS = 3;

export function pickHomeCard(f: CardFacts & { now: number }): HomeCard {
  if (f.schemaReady && f.approvedAt !== null) {
    if (f.welcomedAt === null) return { kind: "welcome" };
    const fresh = unseenEntries(f).filter((e) => e.show === "dialog");
    if (fresh.length > 0) return { kind: "release", entries: fresh.slice(0, RELEASE_STEPS), total: fresh.length };
  }
  return f.shareDue ? { kind: "share" } : null;
}
