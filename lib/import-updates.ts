// Past updates from a TeslaFi export, a TeslaMate export or a typed list. Pure, so the server action and the
// tests run the same code.
import { normaliseVersion } from "@/lib/versions";

export type ImportFormat = "teslafi" | "teslamate" | "typed";
export const FORMAT_LABELS: Record<ImportFormat, string> = { teslafi: "TeslaFi", teslamate: "TeslaMate", typed: "Typed" };

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
// TeslaFi writes a row a minute, so a month is tens of thousands of rows; the versions in it are a handful.
export const MAX_IMPORT_LINES = 100_000;
export const MAX_IMPORT_UPDATES = 300;
const MAX_ISSUES = 8;

export type ImportedUpdate = { version: string; at: string; format: ImportFormat };
export type ParseResult = { updates: ImportedUpdate[]; issues: string[]; error: string | null };

const VERSION = /^(\d{4})\.\d{1,2}\.\d{1,3}(\.\d{1,3})?$/;
const EARLIEST = Date.UTC(2012, 0, 1);
// Wall-clock times without an offset: TeslaFi writes the owner's local time (India), TeslaMate stores UTC.
const IST_OFFSET_MIN = 330;

// "2025.20.6 a1b2c3d4" -> "2025.20.6", or null when it isn't shaped like a Tesla version.
export function cleanVersion(raw: unknown): string | null {
  const v = normaliseVersion(typeof raw === "string" ? raw.replace(/^v/i, "") : null);
  if (!v) return null;
  const match = v.match(VERSION);
  return match && Number(match[1]) >= 2012 ? v : null;
}

// Not before 2012 (the first Model S) and not in the future.
export function inRange(ms: number, now: number): boolean {
  return Number.isFinite(ms) && ms >= EARLIEST && ms <= now;
}

function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, offsetMin = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  // 31 Feb rolls over into March; reject it instead.
  if (new Date(ms).getUTCDate() !== d) return null;
  return ms - offsetMin * 60_000;
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;

// ISO dates and times, and TeslaFi's "6/25/2025 2:30:00 PM". A date alone means noon UTC, the same day in India.
export function parseDateTime(raw: string, assumedOffsetMin: number): number | null {
  const text = raw.trim();
  const iso = text.match(ISO);
  if (iso) {
    const [, y, mo, d, h, mi, s, zone] = iso;
    if (h === undefined) return utcMs(+y, +mo, +d, 12);
    let offset = assumedOffsetMin;
    if (zone) {
      const z = zone.toUpperCase().replace(":", "");
      offset = z === "Z" ? 0 : (z[0] === "-" ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5) || 0));
    }
    return utcMs(+y, +mo, +d, +h, +mi, +(s ?? 0), offset);
  }
  const us = text.match(US);
  if (us) {
    const [, mo, d, y, h, mi, s, ampm] = us;
    if (h === undefined) return utcMs(+y, +mo, +d, 12);
    let hour = +h;
    if (ampm) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
    }
    return utcMs(+y, +mo, +d, hour, +mi, +(s ?? 0), assumedOffsetMin);
  }
  return null;
}

// One CSV line into cells, honouring double quotes.
function splitCells(line: string): string[] {
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
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

type Line = { n: number; text: string };

function lines(text: string): Line[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((t, i) => ({ n: i + 1, text: t.trim() }))
    .filter((l) => l.text !== "");
}

class Issues {
  private list: string[] = [];
  private more = 0;
  add(line: number | null, reason: string) {
    if (this.list.length < MAX_ISSUES) this.list.push(line === null ? reason : `Line ${line}: ${reason}`);
    else this.more++;
  }
  done(): string[] {
    return this.more > 0 ? [...this.list, `${this.more} more not shown`] : this.list;
  }
}

type Found = { version: string; ms: number; line: number | null };

// One row per version, oldest first; a version listed again keeps its earliest date.
function finish(found: Found[], format: ImportFormat, issues: Issues, now: number): ParseResult {
  const byVersion = new Map<string, Found>();
  for (const row of found) {
    if (!inRange(row.ms, now)) {
      issues.add(row.line, `${row.version}: the date is ${row.ms > now ? "in the future" : "before 2012"}`);
      continue;
    }
    const kept = byVersion.get(row.version);
    if (!kept || row.ms < kept.ms) byVersion.set(row.version, row);
  }
  const updates = [...byVersion.values()]
    .sort((a, b) => a.ms - b.ms)
    .map((r) => ({ version: r.version, at: new Date(r.ms).toISOString(), format }));
  if (updates.length > MAX_IMPORT_UPDATES) {
    return { updates: [], issues: issues.done(), error: `That's more than ${MAX_IMPORT_UPDATES} updates. Split it into smaller files.` };
  }
  return { updates, issues: issues.done(), error: updates.length === 0 ? "No updates found." : null };
}

const tooLong = (): ParseResult => ({ updates: [], issues: [], error: `That's more than ${MAX_IMPORT_LINES.toLocaleString("en-IN")} lines.` });

// TeslaFi's export has a row per reading: the time in "Date" and the installed version in "car_version".
// Consecutive rows on the same version collapse into one change; rows with no version (car asleep) are skipped.
// The first version is when the export starts, not an install.
export function parseTeslaFi(text: string, now: number): ParseResult {
  const all = lines(text);
  if (all.length > MAX_IMPORT_LINES) return tooLong();
  const issues = new Issues();
  const header = splitCells(all[0]?.text ?? "").map((h) => h.toLowerCase());
  const dateCol = header.indexOf("date");
  const versionCol = header.includes("car_version") ? header.indexOf("car_version") : header.indexOf("version");
  if (dateCol < 0 || versionCol < 0) return { updates: [], issues: [], error: "This doesn't look like a TeslaFi export. It needs Date and car_version columns." };

  const readings: Found[] = [];
  for (const { n, text: line } of all.slice(1)) {
    const cells = splitCells(line);
    const rawVersion = cells[versionCol] ?? "";
    if (!rawVersion || /^none$/i.test(rawVersion)) continue;
    const version = cleanVersion(rawVersion);
    if (!version) {
      issues.add(n, `"${rawVersion.slice(0, 24)}" isn't a version like 2025.20.6`);
      continue;
    }
    const ms = parseDateTime(cells[dateCol] ?? "", IST_OFFSET_MIN);
    if (ms === null) {
      issues.add(n, `${version}: can't read the date "${(cells[dateCol] ?? "").slice(0, 24)}"`);
      continue;
    }
    readings.push({ version, ms, line: n });
  }
  readings.sort((a, b) => a.ms - b.ms);
  const changes = readings.filter((r, i) => i === 0 || r.version !== readings[i - 1].version);
  return finish(changes, "teslafi", issues, now);
}

type TeslaMateRow = { version: unknown; start_date?: unknown; end_date?: unknown };

// TeslaMate's updates table: one row per install, done at end_date. Rows without one never finished.
function fromTeslaMateRows(rows: { row: TeslaMateRow; line: number | null }[], now: number, issues: Issues): ParseResult {
  const found: Found[] = [];
  for (const { row, line } of rows) {
    const version = cleanVersion(row.version);
    if (!version) {
      issues.add(line, `"${String(row.version ?? "").slice(0, 24)}" isn't a version like 2025.20.6`);
      continue;
    }
    const end = typeof row.end_date === "string" ? row.end_date : "";
    if (!end) continue;
    const ms = parseDateTime(end, 0);
    if (ms === null) {
      issues.add(line, `${version}: can't read the date "${end.slice(0, 24)}"`);
      continue;
    }
    found.push({ version, ms, line });
  }
  return finish(found, "teslamate", issues, now);
}

// A CSV of TeslaMate's updates table (id, start_date, end_date, version, car_id).
export function parseTeslaMateCsv(text: string, now: number): ParseResult {
  const all = lines(text);
  if (all.length > MAX_IMPORT_LINES) return tooLong();
  const header = splitCells(all[0]?.text ?? "").map((h) => h.toLowerCase());
  const [version, end, start] = ["version", "end_date", "start_date"].map((h) => header.indexOf(h));
  if (version < 0 || end < 0) return { updates: [], issues: [], error: "This doesn't look like a TeslaMate export. It needs end_date and version columns." };
  const rows = all.slice(1).map(({ n, text: line }) => {
    const cells = splitCells(line);
    return { line: n, row: { version: cells[version], end_date: cells[end], start_date: start >= 0 ? cells[start] : undefined } };
  });
  return fromTeslaMateRows(rows, now, new Issues());
}

// What TeslaMateApi returns for /cars/:id/updates ({ data: { updates: [...] } }), or a bare array of rows.
export function parseTeslaMateJson(text: string, now: number): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { updates: [], issues: [], error: "That JSON can't be read." };
  }
  const list = Array.isArray(json) ? json : (json as { data?: { updates?: unknown } } | null)?.data?.updates;
  if (!Array.isArray(list)) return { updates: [], issues: [], error: "This doesn't look like TeslaMate's updates. It needs a list with version and end_date." };
  if (list.length > MAX_IMPORT_LINES) return tooLong();
  const rows = list.map((row) => ({ line: null, row: (row && typeof row === "object" ? row : { version: null }) as TeslaMateRow }));
  return fromTeslaMateRows(rows, now, new Issues());
}

// One update per line: "2025.20.6 2025-06-25", optionally with a time.
export function parseTyped(text: string, now: number): ParseResult {
  const all = lines(text);
  if (all.length > MAX_IMPORT_LINES) return tooLong();
  const issues = new Issues();
  const found: Found[] = [];
  for (const { n, text: line } of all) {
    if (line.startsWith("#")) continue;
    const [rawVersion = "", ...rest] = line.split(/[\s,;]+/).filter(Boolean);
    const version = cleanVersion(rawVersion);
    if (!version) {
      issues.add(n, `"${rawVersion.slice(0, 24)}" isn't a version like 2025.20.6`);
      continue;
    }
    // Typed dates are year first, so 06/07 can't be read the wrong way round.
    const date = rest.join(" ");
    const ms = /^\d{4}-/.test(date) ? parseDateTime(date, IST_OFFSET_MIN) : null;
    if (ms === null) {
      issues.add(n, `${version}: the date needs to look like 2025-06-25`);
      continue;
    }
    found.push({ version, ms, line: n });
  }
  return finish(found, "typed", issues, now);
}

// Picks the parser from the content: JSON is TeslaMate, a CSV header says which export it is. Pasted text
// that is neither is read as a typed list.
export function parseImport(text: string, now: number, { pasted = false }: { pasted?: boolean } = {}): ParseResult {
  const start = text.replace(/^﻿/, "").trimStart();
  if (start.startsWith("{") || start.startsWith("[")) return parseTeslaMateJson(start, now);
  const header = splitCells(start.split(/\r?\n/, 1)[0] ?? "").map((h) => h.toLowerCase());
  if (header.includes("end_date")) return parseTeslaMateCsv(start, now);
  if (header.includes("car_version") || (header.includes("date") && header.includes("version"))) return parseTeslaFi(start, now);
  if (pasted) return parseTyped(start, now);
  return { updates: [], issues: [], error: "Use a TeslaFi or TeslaMate export, or type the updates below." };
}

// ---- Checking against the history ----

export type HistoryEntry = { id?: number; version: string; previous_version: string | null; detected_at: string; source: "tracked" | "imported" };
// "new" rows get saved. A version already in the history, or one dated after tracking began, is shown but skipped.
export type RowStatus = "new" | "duplicate" | "newer";
export type PreviewRow = ImportedUpdate & { status: RowStatus };

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; issues: string[] }
  | { status: "preview"; rows: PreviewRow[]; issues: string[] }
  | { status: "done"; message: string };

// Imported rows must come before tracking began: the poll and the stream sync treat the newest row as the
// car's latest version, so an imported row after that would hide the next real change.
export function planImport(updates: ImportedUpdate[], history: HistoryEntry[]): PreviewRow[] {
  const tracked = history.filter((h) => h.source === "tracked").map((h) => Date.parse(h.detected_at));
  const firstTracked = tracked.length > 0 ? Math.min(...tracked) : -Infinity;
  const known = new Set(history.map((h) => h.version));
  return updates.map((u) => ({
    ...u,
    status: known.has(u.version) ? "duplicate" : Date.parse(u.at) >= firstTracked ? "newer" : "new",
  }));
}

export type HistoryInsert = { version: string; previous_version: string | null; detected_at: string };

// The imported rows as one chain, oldest first, each pointing at the version before it (the first at none).
// New rows are inserted; earlier imported rows whose previous version changed are updated. Tracked rows are
// never touched. Two rows can't share a time (version_history is unique on vehicle and time), so a clash
// moves the later one on a second.
export function chainImport(
  rows: PreviewRow[],
  history: HistoryEntry[],
): { inserts: HistoryInsert[]; updates: { id: number; previous_version: string | null }[] } {
  const taken = new Set(history.map((h) => Date.parse(h.detected_at)));
  const fresh = rows
    .filter((r) => r.status === "new")
    .map((r) => {
      let ms = Date.parse(r.at);
      while (taken.has(ms)) ms += 1000;
      taken.add(ms);
      return { version: r.version, ms, id: undefined as number | undefined, previous: undefined as string | null | undefined };
    });
  const existing = history
    .filter((h) => h.source === "imported")
    .map((h) => ({ version: h.version, ms: Date.parse(h.detected_at), id: h.id, previous: h.previous_version as string | null | undefined }));
  const chain = [...existing, ...fresh].sort((a, b) => a.ms - b.ms);

  const inserts: HistoryInsert[] = [];
  const updates: { id: number; previous_version: string | null }[] = [];
  chain.forEach((row, i) => {
    const previous = i > 0 ? chain[i - 1].version : null;
    if (row.id === undefined) inserts.push({ version: row.version, previous_version: previous, detected_at: new Date(row.ms).toISOString() });
    else if (row.previous !== previous) updates.push({ id: row.id, previous_version: previous });
  });
  return { inserts, updates };
}

// Rows sent back from the browser for saving, checked again: only well-formed, in-range updates survive.
export function readSubmitted(value: unknown, now: number): ImportedUpdate[] | null {
  if (!Array.isArray(value) || value.length > MAX_IMPORT_UPDATES) return null;
  const rows: ImportedUpdate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const { version, at, format } = (item ?? {}) as Record<string, unknown>;
    const v = cleanVersion(version);
    const ms = typeof at === "string" ? Date.parse(at) : NaN;
    if (!v || !inRange(ms, now) || typeof format !== "string" || !Object.hasOwn(FORMAT_LABELS, format)) return null;
    if (seen.has(v)) continue;
    seen.add(v);
    rows.push({ version: v, at: new Date(ms).toISOString(), format: format as ImportFormat });
  }
  return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
