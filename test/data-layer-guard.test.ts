import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Stands in for a lint rule (ESLint can't run until typescript-eslint accepts TypeScript 7): the database is
// reached only through lib/server/data, where per-user queries are scoped to their owner (ownerDb) and
// fleet-wide ones are named (system.ts). Anywhere else, the client, its package and db() are refused.

const ROOT = join(import.meta.dir, "..");
const SCANNED = ["app", "components", "lib", "proxy.ts"];
// The layer, and the client it wraps.
const ALLOWED = [/^lib\/server\/data\//, /^lib\/server\/supabase\.ts$/];

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (/\.(ts|tsx|js|mjs)$/.test(path)) return [full];
  try {
    return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
      entry.name === "node_modules" || entry.name.startsWith(".") ? [] : files(join(path, entry.name)),
    );
  } catch {
    return [];
  }
}

// Code only: comments may mention db() (lib/demo.ts explains that it refuses to run in demo mode).
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const RULES: [string, RegExp][] = [
  ["imports the Supabase client module", /from\s+["'](?:@\/lib\/server\/supabase|(?:\.\.?\/)+(?:server\/)?supabase)["']|import\(\s*["'][^"']*\/supabase["']\s*\)/],
  ["imports @supabase/supabase-js", /["']@supabase\/supabase-js["']/],
  ["calls db()", /(?<![\w.])db\(\)/],
  ["creates a Supabase client", /\bcreateClient\(/],
];

function violations(): string[] {
  const out: string[] = [];
  for (const file of SCANNED.flatMap(files)) {
    const path = relative(ROOT, file).split("\\").join("/");
    if (ALLOWED.some((re) => re.test(path))) continue;
    const source = code(readFileSync(file, "utf8"));
    for (const [what, re] of RULES) if (re.test(source)) out.push(`${path} ${what}`);
  }
  return out;
}

describe("database access", () => {
  test("only lib/server/data reaches the database", () => {
    // It really reads the app: the layer itself is among the files, and so are the pages.
    const scanned = SCANNED.flatMap(files).map((f) => relative(ROOT, f).split("\\").join("/"));
    expect(scanned).toContain("lib/server/data/owner.ts");
    expect(scanned).toContain("app/page.tsx");
    expect(violations()).toEqual([]);
  });

  test("the rules catch each way around the layer", () => {
    const hits = (source: string) => RULES.filter(([, re]) => re.test(code(source))).map(([what]) => what);
    expect(hits('import { db } from "@/lib/server/supabase";')).toEqual(["imports the Supabase client module"]);
    expect(hits('import { db } from "./supabase";')).toEqual(["imports the Supabase client module"]);
    expect(hits('import { db } from "../server/supabase";')).toEqual(["imports the Supabase client module"]);
    expect(hits('const { db } = await import("@/lib/server/supabase");')).toEqual(["imports the Supabase client module"]);
    expect(hits('import { createClient } from "@supabase/supabase-js";\ncreateClient(url, key);')).toEqual([
      "imports @supabase/supabase-js",
      "creates a Supabase client",
    ]);
    expect(hits('await db().from("vehicles").select("vin");')).toEqual(["calls db()"]);
    // Comments, the layer's own API and look-alikes are fine.
    expect(hits("// db() refuses to run in demo mode")).toEqual([]);
    expect(hits('await ownerDb(owner).from("vehicles").select("vin");')).toEqual([]);
    expect(hits('import { asOwner } from "@/lib/server/data/owner";')).toEqual([]);
  });
});
