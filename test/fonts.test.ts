import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FONT_HYPHENS_AUTO, FONT_PRELOADS, FONT_SOURCE_CHARS, FONT_WEIGHT_CLASSES } from "@/lib/fonts";
import { config } from "@/proxy";

// The fonts are cut down by hand (scripts/subset-fonts.py, docs/fonts.md). These fail when the source has moved
// on from the last run: a new character, a new weight or hyphenation. The fix is to rerun the script.

const ROOT = join(import.meta.dir, "..");
const GENERATED = [join(ROOT, "lib/fonts.ts"), join(ROOT, "app/fonts.css")];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|js|mjs|json|css|md|mdx)$/.test(name) && !GENERATED.includes(path) ? [path] : [];
  });
}
const text = ["app", "components", "lib"].flatMap((d) => sources(join(ROOT, d))).map((p) => readFileSync(p, "utf8"));
const css = readFileSync(join(ROOT, "app/fonts.css"), "utf8");
const hex = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;

describe("fonts", () => {
  test("every character in the source was there when the fonts were last cut", () => {
    const seen = new Set(FONT_SOURCE_CHARS);
    const added = new Set<string>();
    for (const t of text) for (const c of t) if (c.codePointAt(0)! > 0x7e && !seen.has(c)) added.add(c);
    expect([...added].map((c) => `${hex(c)} ${c}`)).toEqual([]);
  });

  test("the weights in use are the ones the fonts were cut for", () => {
    const used = new Set(text.flatMap((t) => [...t.matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)].map((m) => m[1])));
    expect([...used].sort()).toEqual(FONT_WEIGHT_CLASSES);
  });

  test("hyphenation, which draws U+2010, is as it was", () => {
    expect(text.some((t) => /\bhyphens-auto\b|hyphens:\s*auto/.test(t))).toBe(FONT_HYPHENS_AUTO);
  });

  test("every font file the CSS names is in public/fonts, and each preload is a core file", () => {
    const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(4);
    for (const url of urls) expect(existsSync(join(ROOT, "public", url))).toBe(true);
    expect(FONT_PRELOADS.every((p) => urls.includes(p) && /-core\.[0-9a-f]{10}\.woff2$/.test(p))).toBe(true);
  });

  // Signed out, the proxy redirects any path it runs on (to the app host, or to /home), and a redirected font
  // never draws: the home, waitlist and invite pages would fall back to Arial.
  test("the proxy never runs on the font files", () => {
    const matches = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));
    const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.filter(matches)).toEqual([]);
    expect(matches("/home")).toBe(true);
    expect(matches("/fontsy")).toBe(true);
  });

  test("nothing loads Geist from next/font as well", () => {
    expect(text.filter((t) => t.includes("next/font"))).toEqual([]);
  });
});
