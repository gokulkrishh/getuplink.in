import { afterEach, describe, expect, test } from "bun:test";
import { applyTheme, THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";

// Just enough of a page for the theme code: <head> with the layout's two per-scheme tags, the cookie and
// localStorage. Tag order matters, as a browser uses the first theme-color tag that matches.
type Tag = { id: string; name: string; content: string; media?: string; remove: () => void };

function fakePage(cookie = "") {
  const head: Tag[] = [];
  const tag = (t: Partial<Tag>): Tag => {
    const el = { id: "", name: "", content: "", ...t } as Tag;
    el.remove = () => {
      const i = head.indexOf(el);
      if (i >= 0) head.splice(i, 1);
    };
    return el;
  };
  head.push(
    tag({ name: "theme-color", media: "(prefers-color-scheme: light)", content: THEME_COLORS.light }),
    tag({ name: "theme-color", media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark }),
  );
  const store = new Map<string, string>();
  const doc = {
    cookie,
    documentElement: { dataset: {} as Record<string, string> },
    createElement: () => tag({}),
    getElementById: (id: string) => head.find((t) => t.id === id) ?? null,
    head: {
      prepend: (el: Tag) => {
        el.remove();
        head.unshift(el);
      },
    },
  };
  Object.assign(globalThis, {
    document: doc,
    location: { hostname: "getuplink.in" },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  });
  // What the phone uses: the first tag with no media, or one whose media matches the device.
  const barColour = (device: "light" | "dark") =>
    head.find((t) => t.name === "theme-color" && (!t.media || t.media.includes(device)))?.content;
  return { head, doc, barColour };
}

afterEach(() => {
  for (const k of ["document", "location", "localStorage"]) delete (globalThis as Record<string, unknown>)[k];
});

describe("status bar colour", () => {
  test("a theme chosen in Settings wins over the device's, from the first paint", () => {
    const page = fakePage("uplink-theme=dark");
    new Function(THEME_SCRIPT)();
    expect(page.doc.documentElement.dataset.theme).toBe("dark");
    expect(page.head[0].id).toBe("theme-color-chosen");
    expect(page.barColour("light")).toBe(THEME_COLORS.dark);
  });

  test("following the device adds nothing before the first paint", () => {
    const page = fakePage();
    new Function(THEME_SCRIPT)();
    expect(page.head).toHaveLength(2);
    expect(page.barColour("light")).toBe(THEME_COLORS.light);
    expect(page.barColour("dark")).toBe(THEME_COLORS.dark);
  });

  test("switching in Settings updates one tag, and System removes it", () => {
    const page = fakePage();
    applyTheme("dark");
    expect(page.barColour("light")).toBe(THEME_COLORS.dark);
    applyTheme("light");
    expect(page.head.filter((t) => t.id === "theme-color-chosen")).toHaveLength(1);
    expect(page.barColour("dark")).toBe(THEME_COLORS.light);
    applyTheme("system");
    expect(page.head).toHaveLength(2);
    expect(page.barColour("dark")).toBe(THEME_COLORS.dark);
  });
});
