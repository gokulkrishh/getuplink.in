import type { ReleaseNote } from "@/lib/release-notes";

// Tesla's notes for one version: a title per feature with its description underneath.
export function ReleaseNotesList({ notes }: { notes: ReleaseNote[] }) {
  return (
    <ul className="space-y-4 py-3">
      {notes.map((note, i) => (
        <li key={`${note.title}-${i}`} className="space-y-1">
          <p className="text-sm">
            {note.title}
            {note.subtitle && <span className="ml-2 text-muted-foreground">{note.subtitle}</span>}
          </p>
          {note.description && <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">{note.description}</p>}
        </li>
      ))}
    </ul>
  );
}
