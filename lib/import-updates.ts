// Parsing and checking of pasted or uploaded past updates. Pure, so it runs on the server action and in tests.

export type ParsedUpdate = { version: string; date: string; odometerKm: number | null; line: number };
export type ParseIssue = { line: number; reason: string };

export type ImportState = {
  // "preview" = checked and waiting for confirmation, "done" = saved.
  status: "idle" | "preview" | "done" | "error";
  message: string | null;
  issues: string[];
  count: number;
};

export const IMPORT_MAX_CHARS = 200_000;
export const MAX_SHOWN_ISSUES = 8;

const VERSION = /^\d{4}\.\d{1,2}\.\d{1,3}(\.\d{1,3})?$/;
const MILES_TO_KM = 1.609344;

// Same cleanup as the poller: "2025.32.3 1a2b3c4d" -> "2025.32.3", then the shape must look like a Tesla version.
function cleanVersion(raw: string | undefined): string | null {
  const v = raw?.trim().split(/\s+/)[0]?.replace(/^v/i, "");
  return v && VERSION.test(v) && v !== "0.0.0" ? v : null;
}

// "2026-06-14" or "2026-06-14 10:22:33" / "2026-06-14T10:22:33Z" -> "2026-06-14". Null when not a real date.
function cleanDate(raw: string | undefined): string | null {
  const match = raw?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(+y, +m - 1, +d));
  const real = parsed.getUTCFullYear() === +y && parsed.getUTCMonth() === +m - 1 && parsed.getUTCDate() === +d;
  return real ? `${y}-${m}-${d}` : null;
}

function cleanOdometer(raw: string | undefined, miles: boolean): number | null | "bad" {
  const text = raw?.trim().replace(/,/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return "bad";
  const value = Number(text) * (miles ? MILES_TO_KM : 1);
  return value > 0 && value < 2_000_000 ? Math.round(value * 10) / 10 : "bad";
}

// Splits one CSV line, honouring double quotes.
function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function delimiterOf(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";") && !line.includes(",")) return ";";
  return ",";
}

const versionHeader = (h: string) => /version|firmware/i.test(h) && !/previous|prev|from|old|last/i.test(h);
const dateHeader = (h: string) => /date|installed|timestamp|time/i.test(h) && !/available|download|offered|schedul/i.test(h);
const odometerHeader = (h: string) => /odometer|mileage/i.test(h);

type Columns = { version: number; date: number; odometer: number; miles: boolean };

// A header row names a version column and a date column (any case, e.g. TeslaFi's export or a hand-made CSV).
function readHeader(cells: string[]): Columns | null {
  const version = cells.findIndex(versionHeader);
  const date = cells.findIndex(dateHeader);
  if (version < 0 || date < 0 || version === date) return null;
  const odometer = cells.findIndex(odometerHeader);
  return { version, date, odometer, miles: odometer >= 0 && /\bmi(les)?\b/i.test(cells[odometer]) };
}

// Accepts "version date [odometer km]" lines, or a CSV with a header row. Rows come back oldest first,
// one per version (the earliest date wins); everything else is listed in `issues`.
export function parseUpdates(text: string): { rows: ParsedUpdate[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const found: ParsedUpdate[] = [];
  const lines = text.split(/\r?\n/).map((raw, i) => ({ raw: raw.replace(/^﻿/, ""), n: i + 1 }));
  let columns: Columns | null = null;
  let delimiter = ",";
  let sawFirst = false;

  for (const { raw, n } of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (!sawFirst) {
      sawFirst = true;
      delimiter = delimiterOf(line);
      columns = readHeader(splitCells(line, delimiter));
      if (columns) continue;
    }

    let version: string | undefined;
    let date: string | undefined;
    let odometerText: string | undefined;
    let miles = false;
    if (columns) {
      const cells = splitCells(line, delimiter);
      version = cells[columns.version];
      date = cells[columns.date];
      odometerText = columns.odometer >= 0 ? cells[columns.odometer] : undefined;
      miles = columns.miles;
    } else {
      // A comma inside a number ("5,400") isn't a separator.
      const tokens = line.split(/[\s;]+|,(?!\d{3}\b)/).filter(Boolean);
      [version, date] = tokens;
      // "2026.20.5 2026-06-14 10:22 41200": a time of day may sit between the date and the odometer.
      odometerText = /^\d{1,2}:\d{2}/.test(tokens[2] ?? "") ? tokens[3] : tokens[2];
    }

    const cleanV = cleanVersion(version);
    if (!cleanV) {
      issues.push({ line: n, reason: `"${(version ?? "").slice(0, 24)}" isn't a version like 2026.20.5` });
      continue;
    }
    const cleanD = cleanDate(date);
    if (!cleanD) {
      issues.push({ line: n, reason: `${cleanV}: the date needs to look like 2026-06-14` });
      continue;
    }
    const odometerKm = cleanOdometer(odometerText, miles);
    if (odometerKm === "bad") {
      issues.push({ line: n, reason: `${cleanV}: the odometer isn't a number` });
      continue;
    }
    found.push({ version: cleanV, date: cleanD, odometerKm, line: n });
  }

  // One row per version, keeping the earliest date.
  const byVersion = new Map<string, ParsedUpdate>();
  for (const row of found) {
    const kept = byVersion.get(row.version);
    if (!kept) {
      byVersion.set(row.version, row);
      continue;
    }
    const [keep, drop] = row.date < kept.date ? [row, kept] : [kept, row];
    byVersion.set(row.version, keep);
    issues.push({ line: drop.line, reason: `${drop.version} is listed twice, kept ${keep.date}` });
  }

  const rows = [...byVersion.values()].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  issues.sort((a, b) => a.line - b.line);
  return { rows, issues };
}

// Dates are stored at noon UTC: the same calendar day in India and most of the world.
export const importedAt = (date: string) => `${date}T12:00:00.000Z`;

// Drops rows that can't be imported: in the future, not before tracking began, or already in the history.
export function checkRows(
  rows: ParsedUpdate[],
  context: { now: number; firstTrackedAt: string | null; knownVersions: ReadonlySet<string> },
): { rows: ParsedUpdate[]; issues: ParseIssue[] } {
  const today = new Date(context.now).toISOString().slice(0, 10);
  const firstTracked = context.firstTrackedAt ? Date.parse(context.firstTrackedAt) : null;
  const ok: ParsedUpdate[] = [];
  const issues: ParseIssue[] = [];
  for (const row of rows) {
    const reason =
      row.date > today
        ? `${row.version} is dated in the future`
        : firstTracked !== null && Date.parse(importedAt(row.date)) >= firstTracked
          ? `${row.version} is dated after tracking began on ${context.firstTrackedAt?.slice(0, 10)}`
          : context.knownVersions.has(row.version)
            ? `${row.version} is already in your history`
            : null;
    if (reason) issues.push({ line: row.line, reason });
    else ok.push(row);
  }
  return { rows: ok, issues };
}

export type HistoryInsert = { version: string; previous_version: string | null; detected_at: string; odometer_km: number | null };

// Oldest first; each row points at the one before it. The first has nothing before it.
export function chainRows(rows: ParsedUpdate[]): HistoryInsert[] {
  return rows.map((row, i) => ({
    version: row.version,
    previous_version: i > 0 ? rows[i - 1].version : null,
    detected_at: importedAt(row.date),
    odometer_km: row.odometerKm,
  }));
}

export function describeIssues(issues: ParseIssue[]): string[] {
  const shown = issues.slice(0, MAX_SHOWN_ISSUES).map((i) => `Line ${i.line}: ${i.reason}`);
  if (issues.length > MAX_SHOWN_ISSUES) shown.push(`${issues.length - MAX_SHOWN_ISSUES} more not shown`);
  return shown;
}
