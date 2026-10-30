// View links (Settings → View links): shared by the Settings form, the viewer's banner and the server, so
// all hold a link to the same rules and words.
import { formatClockOn } from "@/lib/format";

// Up to this many links open at once (not ended, not past their end).
export const VIEW_LINK_LIMIT = 2;
export const VIEW_LINK_LABEL_MAX = 40;

const MIN = 60_000;

// How long a link lasts. The first is the default.
export const VIEW_LINK_LENGTHS = [
  { key: "30m", label: "30 minutes", ms: 30 * MIN },
  { key: "1h", label: "1 hour", ms: 60 * MIN },
  { key: "1d", label: "1 day", ms: 24 * 60 * MIN },
] as const;
export type ViewLinkLength = (typeof VIEW_LINK_LENGTHS)[number]["key"];
export const DEFAULT_VIEW_LINK_LENGTH: ViewLinkLength = "30m";

export function viewLinkLengthMs(key: unknown): number | null {
  return VIEW_LINK_LENGTHS.find((l) => l.key === key)?.ms ?? null;
}

// Who it's for, as stored: trimmed, 1 to 40 characters (an emoji counts as one, as the database counts),
// or null when it doesn't fit.
export function viewLinkLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim();
  const length = [...label].length;
  return length >= 1 && length <= VIEW_LINK_LABEL_MAX ? label : null;
}

// What the viewer sees and the owner's list shows of one link. Never its token or hash.
export type ViewLink = {
  id: number;
  label: string;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  hideLocations: boolean;
};

// What a link leaves out: Hide locations, the one option, chosen when the link is made and changeable while
// it's open (Settings → View links). Costs are always shared; invoices never are.
export type ViewLinkHides = { hideLocations: boolean };
export const SHARES_EVERYTHING: ViewLinkHides = { hideLocations: false };

// The choice as sent by the form: strictly true or false, or null when it isn't.
export function viewLinkHides(raw: unknown): ViewLinkHides | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { hideLocations } = raw as Record<string, unknown>;
  return typeof hideLocations === "boolean" ? { hideLocations } : null;
}

// What a page may show its reader: everything for the owner; for a view link, what it doesn't hide. Plain
// data, so a page can pass it to a client component.
export type Shown = { locations: boolean };
export const SHOWS_ALL: Shown = { locations: true };

// What every place a view link hides reads, in plain muted text: place and trip names, stations, sites and
// parked places. "Place not known" stays for its own meaning (places shown, but none named).
export const HIDDEN_PLACE = "Hidden";

// The viewer's pill (components/viewer-bar.tsx): floating at the bottom of every page, or folded into a
// corner button. The choice is kept in this cookie, readable by the page, so the server draws the same state.
export const VIEW_BAR_COOKIE = "tiu_view_bar";
// With this little of the link left, the bar opens again, so its end is no surprise.
export const VIEW_BAR_REOPEN_MS = 5 * 60_000;

// Whether the bar is drawn open: unless folded by the cookie, and always in the link's last minutes.
export const viewBarOpen = (cookie: string | undefined, expiresAt: string, now: number): boolean =>
  cookie !== "hidden" || Date.parse(expiresAt) - now <= VIEW_BAR_REOPEN_MS;

// The page's first script (app/layout.tsx), before the first paint: on a guest's browser (the readable
// tiu_guest hint, lib/view-cookie.ts) it marks <html data-guest="open"> or "folded", as viewBarOpen would.
// globals.css then keeps room for the pill below the page's last content and hides the owner's header
// placeholders, so nothing on a guest's page moves when the pill and the header stream in. Owners never carry the hint: nothing changes.
export const GUEST_SCRIPT = `try{var c=document.cookie,g=/(?:^|; )tiu_guest=(\\d+)/.exec(c);if(g){var e=+g[1]*1000,n=Date.now();if(e>n){var h=/(?:^|; )${VIEW_BAR_COOKIE}=hidden(?:;|$)/.test(c);document.documentElement.dataset.guest=!h||e-n<=${VIEW_BAR_REOPEN_MS}?"open":"folded"}}}catch(_){}`;

// The ended page's words, for a link that has ended, expired, is unknown or was used in another browser,
// also shown when a viewer's open page finds its link ended.
export const LINK_ENDED_TITLE = "This link has expired";
export const LINK_ENDED_BODY = "Ask the owner for a new one.";

// "Ends 10:10 AM", or "Ends 31 Oct, 10:10 AM" when that's not today.
export const endsAt = (expiresAt: string, now: number) => `Ends ${formatClockOn(expiresAt, now)}`;

// A link opens in one browser: used once that browser has opened it (lib/server/view-links.ts claimViewLink).
export const isUsedLink = (link: Pick<ViewLink, "lastViewedAt">) => link.lastViewedAt !== null;

// "Not opened yet", "Opened 10:59 AM", or "Opened 28 Oct, 10:59 AM" when that's not today.
export function openedLine(link: Pick<ViewLink, "lastViewedAt">, now: number): string {
  if (!link.lastViewedAt) return "Not opened yet";
  // "at 10:59 AM" today, "on 28 Oct, 10:59 AM" another day (formatClockOn adds the date then).
  const when = formatClockOn(link.lastViewedAt, now);
  return `Your guest opened it ${when.includes(",") ? "on" : "at"} ${when}`;
}

// A link's address: /v/<token> on the app's host.
export const viewLinkUrl = (origin: string, token: string) => `${origin}/v/${token}`;

// The token's shape: a 32-byte HMAC in base64url (lib/server/view-links.ts viewLinkToken).
export const isViewToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
