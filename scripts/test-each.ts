// Runs every test file in its own `bun test` process, a few at a time, and fails if any file fails.
//
// Why: `bun test` runs all files in one process, and `mock.module` replaces a module for the rest of that
// process, so one file's stubs leak into the files after it. Which files come after depends on the order Bun
// reads them in, which differs between machines and checkouts. On 31 Oct 2026 main's CI passed at 16:16 and
// failed at 17:32 on the same commit: invites.test.ts's next/cache stub (no revalidateTag) broke
// view-link-hides, and another file's stubs left tesla-refresh's request count at 0. Locally two setup tests
// failed instead. Every one of them passed when its file ran alone. One process per file makes each file see
// only its own stubs, whatever the order.
//
// Usage:
//   bun run test                       every test file
//   bun run test test/owners.test.ts   just those files (a folder runs the test files in it, a bare word the
//                                      files whose path contains it, as plain `bun test owners` would)
//   bun run test -t "the setup gate"   flags go to each file's run; a file the filter matches nothing in is
//                                      skipped, not failed
//   bun run test --bail                stops starting files after the first one fails
// For a single file, plain `bun test <file>` is the same thing.

import { existsSync, statSync } from "node:fs";
import { cpus } from "node:os";

// Flags that take a value as the next word ("-t name", "--timeout 9000"). Any other flag stands alone, so a
// word after it is a file, a folder or a filter, never swallowed as its value. "--flag=value" works for all.
const TAKES_VALUE = new Set(["-t", "--test-name-pattern", "--timeout", "--rerun-each", "--seed", "--preload", "--coverage-reporter", "--coverage-dir", "--reporter", "--reporter-outfile"]);

const argv = process.argv.slice(2);
const flags: string[] = [];
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith("-")) wanted.push(arg);
  else if (TAKES_VALUE.has(arg) && argv[i + 1] !== undefined) flags.push(arg, argv[++i]);
  else flags.push(arg);
}
if (flags.some((f) => f === "--watch" || f.startsWith("--watch="))) {
  console.error("--watch can't run across separate processes: use `bun test --watch <file>` for one file.");
  process.exit(1);
}
const bail = flags.some((f) => f === "--bail" || f.startsWith("--bail="));
const filtering = flags.some((f) => f === "-t" || f === "--test-name-pattern" || f.startsWith("--test-name-pattern="));

const all = [...new Bun.Glob("test/**/*.test.{ts,tsx}").scanSync(".")].sort();
// Each argument as files: a test file as it is, a folder as the test files in it, anything else as a filter
// on the path (as `bun test <word>` matches), so `test/` or `owners` still runs one process per file.
function expand(arg: string): string[] {
  const path = arg.replace(/^\.\//, "").replace(/\/$/, "");
  if (existsSync(path) && statSync(path).isFile()) return [path];
  if (existsSync(path) && statSync(path).isDirectory()) return all.filter((f) => f.startsWith(`${path}/`));
  return all.filter((f) => f.includes(arg));
}
const files = wanted.length ? [...new Set(wanted.flatMap(expand))] : all;
if (files.length === 0) {
  console.error(wanted.length ? `No test files match: ${wanted.join(" ")}` : "No test files found.");
  process.exit(1);
}

const workers = Math.max(2, Math.min(8, cpus().length));
type Result = { file: string; code: number; out: string; pass: number; fail: number; errors: number; skipped: boolean };

// The last "N pass" / "N fail" / "N error" lines: Bun's own summary closes the output, after anything a test logs.
const lastCount = (out: string, word: string) => {
  const found = [...out.matchAll(new RegExp(`^\\s*(\\d+) ${word}$`, "gm"))];
  return Number(found.at(-1)?.[1] ?? 0);
};

async function run(file: string): Promise<Result> {
  // A path without ./ is a substring filter to bun test, so test/x.test.ts would also match test/x.test.tsx and
  // run both in one process. ./ makes it exactly this file. process.execPath is the Bun running this script,
  // so every file runs on the same version.
  const proc = Bun.spawn([process.execPath, "test", ...flags, `./${file}`], { stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const out = stdout + stderr;
  const pass = lastCount(out, "pass");
  const fail = lastCount(out, "fail");
  const errors = lastCount(out, "errors?");
  // With -t, a file whose tests the filter matches none of exits 1 ("matched 0 tests"): nothing ran there.
  const skipped = filtering && code !== 0 && pass === 0 && fail === 0 && /matched 0 tests/.test(out);
  return { file, code, out, pass, fail, errors, skipped };
}

const results: Result[] = [];
let next = 0;
let stop = false;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (!stop && next < files.length) {
      const file = files[next++];
      const result = await run(file);
      results.push(result);
      const failed = result.code !== 0 && !result.skipped;
      if (failed && bail) stop = true;
      process.stdout.write(result.skipped ? "s" : failed ? "F" : ".");
    }
  }),
);
process.stdout.write("\n");

const failed = results.filter((r) => r.code !== 0 && !r.skipped).sort((a, b) => a.file.localeCompare(b.file));
for (const r of failed) {
  console.log(`\n──── ${r.file} (exit ${r.code})`);
  console.log(r.out.trim());
}
const sum = (pick: (r: Result) => number) => results.reduce((n, r) => n + pick(r), 0);
const ran = results.filter((r) => !r.skipped).length;
const parts = [`${ran} files`, `${sum((r) => r.pass)} pass`, `${sum((r) => r.fail)} fail`];
const errors = sum((r) => r.errors);
if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
const skipped = results.length - ran;
if (skipped) parts.push(`${skipped} skipped (no test matched)`);
if (stop) parts.push(`stopped after the first failure, ${files.length - results.length} not run`);
console.log(`\n${parts.join(", ")}${failed.length ? `, ${failed.length} file(s) failed: ${failed.map((r) => r.file).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
