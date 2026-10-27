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

// The uplink-copy skill's "Never on screen" words. Admin, privacy, terms and status may name services and
// technical terms with a plain clause, so they're left out of this one.
const TECH_WORDS = /\b(median|telemetry|stream(ed|ing)?|endpoint|payload|cron|null|undefined|NaN|percentile|readings)\b/i;
const TECH_EXEMPT = /app\/(admin|privacy|terms|status|agents\.md|api)\//;

describe("user-facing copy follows AGENTS.md", () => {
  test("no technical words on owner screens (uplink-copy skill)", () => {
    const hits = sources
      .filter(({ path }) => !TECH_EXEMPT.test(path))
      .flatMap(({ path, text }) => jsxText(text).filter((t) => TECH_WORDS.test(t)).map((t) => `${path}: ${t}`));
    expect(hits).toEqual([]);
  });

  for (const [rule, why] of RULES) {
    test(why, () => {
      const hits = sources.flatMap(({ path, text }) => jsxText(text).filter((t) => rule.test(t)).map((t) => `${path}: ${t}`));
      expect(hits).toEqual([]);
    });
  }
});
