import { describe, expect, test } from "bun:test";
import { copyViolations } from "@/lib/copy-rules";
import { type Entry, newestVisibleId, pickHomeCard, unseenEntries, visibleEntries, WELCOME_SINCE, WHATS_NEW, whatsNewAlerts } from "@/lib/whats-new";

const entry = (id: string, audience: Entry["audience"] = "owners", show: Entry["show"] = "card"): Entry => ({
  id,
  date: id.slice(0, 10),
  title: `T ${id}`,
  text: "Text",
  link: { label: "Try it", href: "/x" },
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

  test("a new owner gets the welcome card, not news", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, entries: [c] })).toEqual({ kind: "welcome" });
  });
  test("a welcomed new owner gets news dated after they joined", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, welcomedAt: NOW, entries: [c] })).toEqual({ kind: "news", entry: c, more: 0 });
  });
  test("existing owners never get the welcome card", () => {
    expect(WELCOME_SINCE).toBe(Date.parse("2026-10-31T00:00:00+05:30"));
    expect(pickHomeCard({ ...base, approvedAt: WELCOME_SINCE - 1 })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: WELCOME_SINCE })).toEqual({ kind: "welcome" });
  });
  test("an existing owner gets news dated after their approval", () => {
    expect(pickHomeCard({ ...base, entries: [a] })).toEqual({ kind: "news", entry: a, more: 0 });
  });
  test("an owner approved after the entry's date does not get it", () => {
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-12"), welcomedAt: 1, entries: [a] })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-10") + 3_600_000, welcomedAt: 1, entries: [a] })).toBeNull();
    expect(pickHomeCard({ ...base, approvedAt: ist("2026-11-09") + 3_600_000, welcomedAt: 1, entries: [a] })?.kind).toBe("news");
  });
  test("several unseen: the newest, with a count of the rest", () => {
    expect(pickHomeCard({ ...base, entries: [a, c, b] })).toEqual({ kind: "news", entry: c, more: 2 });
  });
  test("entries at or below the seen id are skipped", () => {
    expect(pickHomeCard({ ...base, entries: [a, b, c], seenId: b.id })).toEqual({ kind: "news", entry: c, more: 0 });
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
    expect(pickHomeCard({ ...base, admin: true, entries: [d] })).toEqual({ kind: "news", entry: d, more: 0 });
  });
  test("welcome comes before news, news before share", () => {
    expect(pickHomeCard({ ...base, approvedAt: NEW, entries: [c], shareDue: true })).toEqual({ kind: "welcome" });
    expect(pickHomeCard({ ...base, entries: [a], shareDue: true })?.kind).toBe("news");
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
  const card = entry("2026-11-20-b");
  const bell = entry("2026-11-25-c", "owners", "bell");
  const facts = { ...base, entries: [card, bell] };

  test("the Home card skips bell entries, and counts only card ones in more", () => {
    expect(pickHomeCard({ ...facts })).toEqual({ kind: "news", entry: card, more: 0 });
    expect(pickHomeCard({ ...base, entries: [bell], shareDue: true })).toEqual({ kind: "share" });
  });
  test("the bell lists every unseen visible entry, newest first, as info lines", () => {
    const alerts = whatsNewAlerts(facts);
    expect(alerts.map((a) => a.key)).toEqual(["whats-new-2026-11-25-c", "whats-new-2026-11-20-b"]);
    expect(alerts[0]).toMatchObject({ kind: "info", title: bell.title, detail: bell.text, href: "/releases", since: "2026-11-25T00:00:00+05:30" });
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

describe("every WHATS_NEW entry", () => {
  test("is well formed", () => {
    for (const e of WHATS_NEW) {
      expect(e.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.id.startsWith(`${e.date}-`)).toBe(true);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(e.date);
      expect(["card", "bell"]).toContain(e.show);
      expect(["draft", "admin", "owners"]).toContain(e.audience);
      expect(e.link.href.startsWith("/")).toBe(true);
      expect(e.link.label.length).toBeGreaterThan(0);
    }
  });
  test("ids are unique and the list is newest first", () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort().reverse());
  });
  test("the words follow the copy rules", () => {
    for (const e of WHATS_NEW) {
      for (const text of [e.title, e.text, e.more ?? "", e.link.label]) expect({ id: e.id, text, broken: copyViolations(text) }).toEqual({ id: e.id, text, broken: [] });
      expect(/[.!]$/.test(e.title) || /[.!]$/.test(e.link.label)).toBe(false);
    }
  });
});
