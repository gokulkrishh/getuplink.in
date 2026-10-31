import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// An ⓘ holds one or two short sentences the page can't say itself (docs/charts.md). Admin pages are left
// out: they're for the operator.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const notes = [...files("app"), ...files("components")]
  .filter((f) => !/app\/admin\/|components\/admin\//.test(f))
  .flatMap((f) => {
    const source = readFileSync(f, "utf8");
    const found = [
      ...[...source.matchAll(/\binfo=(?:"([^"]+)"|\{`([^`]+)`\})/g)].map((m) => m[1] ?? m[2]),
      ...[...source.matchAll(/\babout="([^"]+)"/g)].map((m) => m[1]),
      ...[...source.matchAll(/<InfoButton[^>]*>([^<{]+)<\/InfoButton>/g)].map((m) => m[1]),
    ];
    return found.map((text) => ({ file: f, text: text.replace(/\$\{[^}]+\}/g, "X").trim() }));
  });

// A guard that the patterns above still find notes at all, not a count to keep up. The rollout's adoption
// note moved into its fold's opened part (31 Oct 2026), as a line rather than an ⓘ.
test("the ⓘ notes are found", () => {
  expect(notes.length).toBeGreaterThan(2);
});

test("every ⓘ note is one or two short sentences", () => {
  const long = notes.filter(({ text }) => text.split(/(?<=[.?])\s+/).filter(Boolean).length > 2 || text.length > 140);
  expect(long).toEqual([]);
});
