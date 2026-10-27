import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The checkable parts of AGENTS.md "Writing copy", run over the text pages render: JSX text between tags.
// Wording itself needs a reader; this catches what a rule can.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// Text a user reads: what sits between a closing ">" and the next "<", minus code-looking runs.
function jsxText(source: string): string[] {
  return [...source.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1 && !/[=;()]|=>|^\w+\(|\bconst\b|\breturn\b/.test(t));
}

const RULES: [RegExp, string][] = [
  [/\bOops\b/i, "no 'Oops'"],
  [/\w!(\s|$)/, "no exclamation marks"],
  [/→|←|\s–\s|\s—\s/, "no arrows or dashes between words; write '58% to 51%'"],
  [/\b(color|colors|kilometer|kilometers|meter|meters|center|centered|license)\b/, "Indian/British spelling: colour, kilometre, metre, centre, licence"],
  [/\b(\d+)\s*-\s*(\d+)\s*(km|%|kWh|km\/h)\b/, "a range reads '30 to 45 km/h'"],
];

const sources = [...files("app"), ...files("components")].map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("user-facing copy follows AGENTS.md", () => {
  for (const [rule, why] of RULES) {
    test(why, () => {
      const hits = sources.flatMap(({ path, text }) => jsxText(text).filter((t) => rule.test(t)).map((t) => `${path}: ${t}`));
      expect(hits).toEqual([]);
    });
  }
});
