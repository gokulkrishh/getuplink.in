import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEMO_ENTRIES } from "@/lib/server/demo/whats-new";
import { copyViolations } from "@/lib/copy-rules";
import { ENTRY_ICONS, type Entry, KINDS, newEntryIds, newestVisibleId, pickHomeCard, seenUpTo, unseenEntries, visibleEntries, WELCOME_SINCE, WHATS_NEW, whatsNewAlerts } from "@/lib/whats-new";

const entry = (id: string, audience: Entry["audience"] = "owners", show: Entry["show"] = "dialog"): Entry => ({
  id,
  date: id.slice(0, 10),
  title: `T ${id}`,
  text: "Text",
  version: "0.1",
  kind: "New feature",
  icon: "Sparkles",
  audience,
  show,
});
const ist = (day: string) => Date.parse(`${day}T00:00:00+05:30`);
const NOW = ist("2026-12-01");
const OLD = ist("2026-09-01"); // joined before WELCOME_SINCE
const NEW = ist("2026-11-05"); // joined after WELCOME_SINCE
const base = { entries: [] as Entry[], now: NOW, admin: false, approvedAt: OLD as number | null, welcomedAt: null as number | null, seenId: null as string | null, shareDue: false, schemaReady: true };

describe("WHATS_NEW", () => {
  test("ships one draft entry, so nobody sees anything yet", () => {
    expect(WHATS_NEW.map((e) => [e.id, e.audience])).toEqual([["2026-11-20-guest-access", "draft"]]);
    expect(visibleEntries(WHATS_NEW, false)).toEqual([]);
    expect(visibleEntries(WHATS_NEW, true)).toEqual([]);
  });
});

describe("pickHomeCard", () => {
  const a = entry("2026-11-10-a");
  const b = entry("2026-11-20-b");
  const c = entry("2026-11-25-c");

  test("a new owner gets the welcome tour, not news", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, entries: [c] })).toEqual({ kind: "welcome" });
  });
  test("a welcomed new owner gets news dated after they joined", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, welcomedAt: NOW, entries: [c] })).toEqual({ kind: "release", entries: [c], total: 1 });
  });
  test("existing owners never get the welcome tour", () => {
    expect(WELCOME_SINCE).toBe(Date.parse("2026-10-31T00:00:00+05:30"));
    expect(pickHomeCard({ ...base, approvedAt: WELCOME_SINCE - 1 })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: WELCOME_SINCE })).toEqual({ kind: "welcome" });
  });
  test("an existing owner gets news dated after their approval", () => {
    expect(pickHomeCard({ ...base, entries: [a] })).toEqual({ kind: "release", entries: [a], total: 1 });
  });
  test("an owner approved after the entry's date does not get it", () => {
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-12"), welcomedAt: 1, entries: [a] })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-10") + 3_600_000, welcomedAt: 1, entries: [a] })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-09") + 3_600_000, welcomedAt: 1, entries: [a] })?.kind).toBe("release");
  });
  test("several unseen: all of them newest first, up to 3", () => {
    expect(pickHomeCard({ ...base, entries: [a, c, b] })).toEqual({ kind: "release", entries: [c, b, a], total: 3 });
  });
  test("more than 3 unseen: the newest 3, with the full count", () => {
    const e = entry("2026-11-27-e");
    expect(pickHomeCard({ ...base, entries: [a, b, c, e] })).toEqual({ kind: "release", entries: [e, c, b], total: 4 });
  });
  test("entries at or below the seen id are skipped", () => {
    expect(pickHomeCard({ ...base, entries: [a, b, c], seenId: b.id })).toEqual({ kind: "release", entries: [c], total: 1 });
    expect(pickHomeCard({ ...base, entries: [a, b, c], seenId: c.id })).toBeNull();
  });
  test("draft entries are hidden for everyone", () => {
    const d = entry("2026-11-30-d", "draft");
    expect(pickHomeCard({ ...base, entries: [d] })).toBeNull();
    expect(pickHomeCard({ ...base, admin: true, entries: [d] })).toBeNull();
  });
  test("admin entries are for the admin only", () => {
    const d = entry("2026-11-30-d", "admin");
    expect(pickHomeCard({ ...base, entries: [d] })).toBeNull();
    expect(pickHomeCard({ ...base, admin: true, entries: [d] })).toEqual({ kind: "release", entries: [d], total: 1 });
  });
  test("welcome comes before news, news before share", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, entries: [c], shareDue: true })).toEqual({ kind: "welcome" });
    expect(pickHomeCard({ ...base, entries: [a], shareDue: true })?.kind).toBe("release");
  });
  test("the share card shows only when neither does", () => {
    expect(pickHomeCard({ ...base, shareDue: true })).toEqual({ kind: "share" });
    expect(pickHomeCard({ ...base })).toBeNull();
  });
  test("no schema: no welcome or news, share still allowed", () => {
    expect(pickHomeCard({ ...base, schemaReady: false, approvedAt: NEW, entries: [a] })).toBeNull();
    expect(pickHomeCard({ ...base, schemaReady: false, approvedAt: NEW, entries: [a], shareDue: true })).toEqual({ kind: "share" });
  });
  test("an unknown approval date gets neither welcome nor news", () => {
    expect(pickHomeCard({ ...base, approvedAt: null, entries: [a] })).toBeNull();
  });
});

describe("visible list", () => {
  test("newest first, drafts out, admin entries for the admin; newest id", () => {
    const list = [entry("2026-11-10-a"), entry("2026-11-25-c", "admin"), entry("2026-11-20-b"), entry("2026-11-30-d", "draft")];
    expect(visibleEntries(list, false).map((e) => e.id)).toEqual(["2026-11-20-b", "2026-11-10-a"]);
    expect(visibleEntries(list, true).map((e) => e.id)).toEqual(["2026-11-25-c", "2026-11-20-b", "2026-11-10-a"]);
    expect(newestVisibleId(list, true)).toBe("2026-11-25-c");
    expect(newestVisibleId([entry("2026-11-30-d", "draft")], true)).toBeNull();
  });
});

describe("bell level", () => {
  const card = entry("2026-11-20-b", "owners", "dialog");
  const bell = entry("2026-11-25-c", "owners", "bell");
  const facts = { ...base, entries: [card, bell] };

  test("the Home dialog skips bell entries, and counts only dialog ones", () => {
    expect(pickHomeCard({ ...facts })).toEqual({ kind: "release", entries: [card], total: 1 });
    expect(pickHomeCard({ ...base, entries: [bell], shareDue: true })).toEqual({ kind: "share" });
  });
  test("the bell lists every unseen visible entry, newest first, as info lines", () => {
    const alerts = whatsNewAlerts(facts);
    expect(alerts.map((a) => a.key)).toEqual(["whats-new-2026-11-25-c", "whats-new-2026-11-20-b"]);
    expect(alerts[0]).toMatchObject({ kind: "info", title: bell.title, detail: bell.text, href: "/release-notes", since: "2026-11-25T00:00:00+05:30" });
  });
  test("same rules as the card: seen, drafts, joined later, no schema", () => {
    expect(whatsNewAlerts({ ...facts, seenId: bell.id })).toEqual([]);
    expect(whatsNewAlerts({ ...base, entries: [entry("2026-11-30-d", "draft", "bell")] })).toEqual([]);
    expect(whatsNewAlerts({ ...facts, approvedAt: ist("2026-11-22") })).toHaveLength(1);
    expect(whatsNewAlerts({ ...facts, schemaReady: false })).toEqual([]);
    expect(whatsNewAlerts({ ...facts, approvedAt: null })).toEqual([]);
    expect(unseenEntries({ ...facts, seenId: card.id }).map((e) => e.id)).toEqual([bell.id]);
  });
});

describe("newEntryIds", () => {
  const a = entry("2026-11-10-a");
  const b = entry("2026-11-20-b", "owners", "bell");
  const c = entry("2026-11-25-c");
  const facts = { ...base, entries: [a, b, c] };
  test("every entry the owner hadn't seen, either level, newest first", () => {
    expect(newEntryIds(facts)).toEqual([c.id, b.id, a.id]);
  });
  test("only those past the seen marker", () => {
    expect(newEntryIds({ ...facts, seenId: b.id })).toEqual([c.id]);
    expect(newEntryIds({ ...facts, seenId: c.id })).toEqual([]);
  });
  test("a new owner who closed the welcome tour has seen the older ones; one approved after an entry never gets a dot for it", () => {
    expect(newEntryIds({ ...facts, approvedAt: NEW, seenId: b.id })).toEqual([c.id]);
    expect(newEntryIds({ ...facts, approvedAt: ist("2026-11-22") })).toEqual([c.id]);
  });
  test("no dots for drafts, other people's admin entries, without the schema or an approval date", () => {
    expect(newEntryIds({ ...base, entries: [entry("2026-11-30-d", "draft"), entry("2026-11-30-e", "admin")] })).toEqual([]);
    expect(newEntryIds({ ...facts, schemaReady: false })).toEqual([]);
    expect(newEntryIds({ ...facts, approvedAt: null })).toEqual([]);
  });
});

const parts = (v: string) => v.split(".").map(Number);
const cmp = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

describe.each([
  ["WHATS_NEW", WHATS_NEW],
  ["the demo samples", DEMO_ENTRIES],
] as const)("every entry in %s", (_name, list) => {
  test("is well formed", () => {
    for (const e of list) {
      expect(e.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.id.startsWith(`${e.date}-`)).toBe(true);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(e.date);
      expect(["dialog", "bell"]).toContain(e.show);
      expect(KINDS).toContain(e.kind);
      expect(ENTRY_ICONS).toContain(e.icon);
      expect(["draft", "admin", "owners"]).toContain(e.audience);
      expect(e.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
      expect("link" in e).toBe(false);
    }
  });
  test("ids are unique, newest first, and the version never goes down in that order", () => {
    const ids = list.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort().reverse());
    for (let i = 1; i < list.length; i++) expect(cmp(list[i - 1].version, list[i].version)).toBeGreaterThanOrEqual(0);
  });
  test("every entry that is not a draft has a screenshot that exists", () => {
    for (const e of list) {
      if (e.audience === "draft") continue;
      expect({ id: e.id, image: e.image }).not.toEqual({ id: e.id, image: undefined });
      const img = e.image;
      if (!img) continue;
      expect(img.src.startsWith("/whats-new/")).toBe(true);
      expect({ src: img.src, exists: existsSync(join(process.cwd(), "public", img.src)) }).toEqual({ src: img.src, exists: true });
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
    }
  });
  test("a dialog entry that is not a draft has a screenshot", () => {
    for (const e of list) if (e.show === "dialog" && e.audience !== "draft") expect({ id: e.id, image: !!e.image }).toEqual({ id: e.id, image: true });
  });
  test("a version has at most 3 dialog entries", () => {
    const count = new Map<string, number>();
    for (const e of list) if (e.show === "dialog") count.set(e.version, (count.get(e.version) ?? 0) + 1);
    for (const [version, n] of count) expect({ version, ok: n <= 3 }).toEqual({ version, ok: true });
  });
  test("the words follow the copy rules", () => {
    for (const e of list) {
      for (const text of [e.title, e.text, e.more ?? "", e.image?.alt ?? ""]) expect({ id: e.id, text, broken: copyViolations(text) }).toEqual({ id: e.id, text, broken: [] });
      if (e.image) expect(e.image.alt.trim().length).toBeGreaterThan(0);
      expect(/[.!]$/.test(e.title)).toBe(false);
    }
  });
});

describe("closing the release dialog", () => {
  // A newer small entry (bell only) and an older big one (in the dialog). The dialog shows only the big one.
  const bell = entry("2026-11-25-bell", "owners", "bell");
  const big = entry("2026-11-20-big");
  const entries = [bell, big, entry("2026-11-22-draft", "draft")];
  test("marks seen only up to the newest entry the dialog showed, so the newer bell line stays", () => {
    const seenId = seenUpTo(entries, false, big.id);
    expect(seenId).toBe(big.id);
    expect(whatsNewAlerts({ ...base, entries, seenId }).map((a) => a.key)).toEqual([`whats-new-${bell.id}`]);
  });
  test("an id that isn't a visible entry marks nothing", () => {
    expect(seenUpTo(entries, false, "2026-11-22-draft")).toBeNull();
    expect(seenUpTo(entries, false, "2099-01-01-made-up")).toBeNull();
    expect(seenUpTo(entries, false, 42)).toBeNull();
  });
  test("with no id, the newest visible entry, as opening the page does", () => {
    expect(seenUpTo(entries, false, undefined)).toBe(bell.id);
  });
});
