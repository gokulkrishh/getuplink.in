import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel);
    return rel.endsWith(".tsx") ? [rel] : [];
  });
}

describe("the page links", () => {
  // The phone's pill comes after the page in the document, so after "Skip to content" the next Tab is the
  // page's own first control, and a screen reader reads the page before the links.
  test("every page with the header renders the phone links last, after its content; /setup never", () => {
    const pages = [...sources("app"), ...sources("components")].filter((f) => f !== "components/header.tsx");
    const withHeader = pages.filter((f) => /<Header[\s/>]/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(withHeader.length).toBeGreaterThan(8);
    for (const f of withHeader) {
      const src = readFileSync(join(ROOT, f), "utf8");
      if (/<Header[^>]*onSetup/.test(src)) {
        expect(src, f).not.toContain("<PhoneNav");
        continue;
      }
      expect(src, f).toContain("<PhoneNav");
      expect(src.lastIndexOf("<PhoneNav"), f).toBeGreaterThan(src.indexOf("<Header"));
    }
    // The header itself doesn't render it, or it would sit between the header and the page.
    const header = readFileSync(join(ROOT, "components/header.tsx"), "utf8");
    const body = header.slice(header.indexOf("export function Header("));
    expect(body).not.toContain("<PhoneNav");
  });
});
