// Release notes as Uplink stores and shows them. Tesla doesn't document the response,
// so parsing is defensive: anything that doesn't look like notes is dropped.
export type ReleaseNote = { title: string; subtitle?: string; description?: string };

export type ReleaseNotesByVersion = Record<string, ReleaseNote[]>;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function parseReleaseNotes(response: unknown): ReleaseNote[] {
  const list = (response as { release_notes?: unknown } | null)?.release_notes;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const title = text((item as Record<string, unknown>)?.title);
    if (!title) return [];
    const { subtitle, description } = item as Record<string, unknown>;
    return [{ title, subtitle: text(subtitle), description: text(description) }];
  });
}
