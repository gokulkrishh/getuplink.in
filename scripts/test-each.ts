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
// Usage: bun run test (every file), bun run test test/owners.test.ts (just those), bun run test -t "name"
// (flags go to each file's run). For a single file, plain `bun test <file>` is the same thing.

import { cpus } from "node:os";

// Flags (--bail, -t name) go to every `bun test`; the rest are the files to run, else every test file.
const argv = process.argv.slice(2);
const flags: string[] = [];
const paths: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith("-")) paths.push(arg);
  else {
    flags.push(arg);
    // A flag's value ("-t name", "--timeout 9000") goes with it, unless written as --flag=value.
    const next = argv[i + 1];
    if (!arg.includes("=") && next !== undefined && !next.startsWith("-") && !/\.test\.tsx?$/.test(next)) flags.push(argv[++i]);
  }
}
const files = paths.length ? paths : [...new Bun.Glob("test/**/*.test.{ts,tsx}").scanSync(".")].sort();
if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const workers = Math.max(2, Math.min(8, cpus().length));
type Result = { file: string; code: number; out: string; pass: number; fail: number };

async function run(file: string): Promise<Result> {
  // A path without ./ is a substring filter to bun test, so test/x.test.ts would also match test/x.test.tsx and
  // run both in one process. ./ makes it exactly this file.
  const exact = file.startsWith("./") || file.startsWith("/") ? file : `./${file}`;
  const proc = Bun.spawn(["bun", "test", ...flags, exact], { stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const out = stdout + stderr;
  const count = (word: string) => Number(out.match(new RegExp(`^\\s*(\\d+) ${word}$`, "m"))?.[1] ?? 0);
  return { file, code, out, pass: count("pass"), fail: count("fail") };
}

const results: Result[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (next < files.length) {
      const file = files[next++];
      const result = await run(file);
      results.push(result);
      process.stdout.write(result.code === 0 ? "." : "F");
    }
  }),
);
process.stdout.write("\n");

const failed = results.filter((r) => r.code !== 0).sort((a, b) => a.file.localeCompare(b.file));
for (const r of failed) {
  console.log(`\n──── ${r.file} (exit ${r.code})`);
  console.log(r.out.trim());
}
const pass = results.reduce((n, r) => n + r.pass, 0);
const fail = results.reduce((n, r) => n + r.fail, 0);
console.log(`\n${files.length} files, ${pass} pass, ${fail} fail${failed.length ? `, ${failed.length} file(s) failed: ${failed.map((r) => r.file).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
