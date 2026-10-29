import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RULES } from "@/lib/copy-rules";

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
    .map((m) => m[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1 && !/[=;()]|=>|^\w+\(|\bconst\b|\breturn\b/.test(t));
}

const sources = [...files("app"), ...files("components")].map((path) => ({ path, text: readFileSync(path, "utf8") }));

// Copy that lives in props and object fields rather than between tags: titles, descriptions, ⓘ notes, labels,
// empty states, aria-labels. Every quoted string on a line that sets one of these.
const PROP = /\b(title|description|note|info|label|intro|placeholder|empty|caption|basis|aria-label|value)\s*[=:]/;
function propText(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => PROP.test(line) && !/^\s*(\/\/|\*|import\b)/.test(line))
    .flatMap((line) => [...line.matchAll(/"([^"\\]*)"|`([^`]*)`/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, "…")))
    .filter((t) => /[A-Za-z]{2,} [A-Za-z]/.test(t) && !/^[a-z0-9:\-/[\]._ &>*()=,#%!@'+~…]+$/.test(t));
}

// Owner-facing sentences kept in lib/ (errors, notes, status lines): every quoted string of two or more words.
const OWNER_LIB = ["lib/login-errors.ts", "lib/run-error.ts", "lib/status.ts", "lib/unit-words.ts", "lib/drive-verdict.ts", "lib/car-now.ts", "lib/periods.ts", "lib/seasons.ts", "lib/charge-level.ts", "lib/last-synced.ts", "lib/car-notices.ts", "lib/alerts.ts", "lib/site.ts", "lib/owners.ts"];
function libText(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|import\b)/.test(line) && !/console\.|new Error\(|\.test\(/.test(line))
    // An object key (`"Car data stream": …`) is a stored name, not text on screen.
    .flatMap((line) => [...line.matchAll(/"([^"\\]*)"(?!\s*:)|`([^`]*)`/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, "…")))
    .filter((t) => /[A-Za-z]{2,} [A-Za-z]/.test(t));
}

const shown = [
  ...sources.map(({ path, text }) => ({ path, texts: [...jsxText(text), ...propText(text)] })),
  ...OWNER_LIB.map((path) => ({ path, texts: libText(readFileSync(path, "utf8")) })),
];

// The uplink-copy skill's "Never on screen" words and its "Say this, not that" table. Admin, privacy, terms
// and status may name services and technical terms with a plain clause, so they're left out of these.
const TECH_WORDS = /\b(median|telemetry|stream(s|ed|ing)?|endpoint|payload|cron|null|undefined|NaN|percentile|readings)\b|\b(a|the|each|every|first|latest|last|no|one) reading\b/i;
const TECH_EXEMPT = /app\/(admin|privacy|terms|status|agents\.md|api)\/|components\/admin\//;
const WORD_RULES: [RegExp, string][] = [
  [TECH_WORDS, "no technical words on owner screens (uplink-copy skill)"],
  [/\b(log ?in|log ?out|login|logout)\b/i, "'Sign in' and 'Sign out', never 'Log in'"],
  [/(?<!full[- ])\bpack\b/i, "'battery', not 'pack' (except the 'full pack' figure)"],
  [/\bsessions?\b(?<!^Charging sessions)|^Sessions?\b \w/, "'charge', not 'session' ('Charging sessions' only as the list title)"],
  [/\bvehicles?\b/i, "'car', not 'vehicle'"],
  [/\b(Avg|e\.g\.|etc|vs)\b/, "write words out: 'Average', not 'Avg'"],
  [/\b(please|sorry|simply|successfully)\b/i, "no filler words"],
  [/Something went wrong/i, "errors say what happened, not 'Something went wrong'"],
  [/\bSentry mode\b/, "product names keep their case: Sentry Mode"],
  [/[a-z]; [a-z]/, "no semicolons joining sentences"],
];

describe("user-facing copy follows AGENTS.md", () => {
  for (const [rule, why] of WORD_RULES) {
    test(why, () => {
      const hits = shown
        .filter(({ path }) => !TECH_EXEMPT.test(path))
        .flatMap(({ path, texts }) => texts.filter((t) => rule.test(t)).map((t) => `${path}: ${t}`));
      expect(hits).toEqual([]);
    });
  }

  for (const [rule, why] of RULES) {
    test(why, () => {
      const hits = shown.flatMap(({ path, texts }) => texts.filter((t) => rule.test(t)).map((t) => `${path}: ${t}`));
      expect(hits).toEqual([]);
    });
  }
});
