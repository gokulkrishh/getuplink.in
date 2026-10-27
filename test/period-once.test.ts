import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { barsSpan } from "@/components/stats/chart-caption";
import { fromTracking, type Period, periodTimeframe, rangeTimeframe } from "@/lib/periods";

// Every chart names its period once, at the top (its headline, summary line or description); the caption
// under it is only for caveats (see "Name the period once" in docs/charts.md). These fail when a caption
// says the period again.

const ROOT = join(import.meta.dir, "..");

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (/\.tsx?$/.test(path)) return [full];
  try {
    return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
      entry.name === "node_modules" || entry.name.startsWith(".") ? [] : files(join(path, entry.name)),
    );
  } catch {
    return [];
  }
}

// A caption built from the frame's title or words ("Last 7 days", "in the last 7 days"), or from props that
// carry them, is the period said again under the chart.
const PERIOD_IN_CAPTION = /\bcaption[=:]\s*\{?[^\n]*\b(?:frame\.(?:title|words)|title|words|upper\(words\))\b/;

// The page names its period once: Stats' period switch, or Home's greeting line. Section text built from a
// frame's words ("in the last 7 days") says it again.
// Screen-reader labels may name it: they're read without the switch.
const PERIOD_IN_TEXT = /\bframe\.(words|title)\b/;
const LABEL = /\b(aria-)?label=/;

describe("sections never name the period the page already shows", () => {
  test("no text is built from a frame's words or title", () => {
    const hits: string[] = [];
    for (const file of ["app", "components"].flatMap(files)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, k) => {
          if (!/^\s*\/\//.test(line) && PERIOD_IN_TEXT.test(line) && !LABEL.test(line)) hits.push(`${relative(ROOT, file)}:${k + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

describe("captions never name the period", () => {
  test("no caption is built from a frame's title or words", () => {
    const hits: string[] = [];
    for (const file of ["app", "components"].flatMap(files)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, k) => {
          if (!/^\s*\/\//.test(line) && PERIOD_IN_CAPTION.test(line)) hits.push(`${relative(ROOT, file)}:${k + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  const now = Date.UTC(2026, 9, 26, 6, 30);
  const periods: Period[] = ["day", "week", "month", "year", "all"];

  test("barsSpan is left out where the bars cover the period", () => {
    for (const period of ["day", "week", "month", "year"] as const) expect(barsSpan(periodTimeframe(period, now))).toBeUndefined();
    expect(barsSpan(rangeTimeframe({ from: 20_700, to: 20_729 }, now))).toBeUndefined();
  });

  test("barsSpan never repeats the period's title or words", () => {
    const frames = [
      ...periods.map((p) => periodTimeframe(p, now)),
      ...periods.map((p) => fromTracking(periodTimeframe(p, now), Date.UTC(2026, 9, 23), now).frame),
    ];
    for (const frame of frames) {
      const span = barsSpan(frame);
      if (span === undefined) continue;
      expect(span.toLowerCase()).not.toContain(frame.title.toLowerCase());
      expect(span.toLowerCase()).not.toContain(frame.words.toLowerCase());
    }
  });

  test("All's bars name their own span, whole years", () => {
    expect(barsSpan(periodTimeframe("all", now))).toMatch(/^Each year, \d{4} to 2026$/);
  });
});
