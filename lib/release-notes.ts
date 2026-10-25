// Release notes as Uplink stores and shows them. Tesla doesn't document the response,
// so parsing is defensive: anything that doesn't look like notes is dropped.
export type ReleaseNote = { title: string; subtitle?: string; description?: string };

export type ReleaseNotesByVersion = Record<string, ReleaseNote[]>;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// Tesla's list also carries notes from earlier releases (each tagged with its customer_version,
// e.g. "2026.32" inside 2026.38.3.1's notes) and repeats items like "Security Improvements".
// Keep only this release's notes, once each.
export function parseReleaseNotes(response: unknown): ReleaseNote[] {
  const { release_notes: list, release_notes_version: version } = (response ?? {}) as Record<string, unknown>;
  if (!Array.isArray(list)) return [];
  const release = text(version);
  const seen = new Set<string>();
  return list.flatMap((item) => {
    const { title: rawTitle, subtitle, description, customer_version } = (item ?? {}) as Record<string, unknown>;
    const title = text(rawTitle);
    if (!title) return [];
    const from = text(customer_version);
    // Whole segments only: 2026.20.1 is not part of 2026.2.
    if (release && from && release !== from && !release.startsWith(`${from}.`)) return [];
    const note = { title, subtitle: text(subtitle), description: text(description) };
    const key = JSON.stringify(note);
    if (seen.has(key)) return [];
    seen.add(key);
    return [note];
  });
}
