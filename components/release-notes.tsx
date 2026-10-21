import { Fragment } from "react";
import type { ReleaseNote } from "@/lib/release-notes";

// Tesla's notes for one version as a quiet changelog: category on the left, the change on the right.
export function ReleaseNotesList({ notes }: { notes: ReleaseNote[] }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-4 border-l pl-4 sm:grid-cols-[10rem_1fr]">
      {notes.map((note, i) => (
        <Fragment key={`${note.title}-${i}`}>
          <dt className="text-xs text-faint sm:pt-0.5">{note.title}</dt>
          <dd className="-mt-3 space-y-1 sm:mt-0">
            {note.subtitle ? (
              <>
                <p className="text-sm">{note.subtitle}</p>
                {note.description && (
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{note.description}</p>
                )}
              </>
            ) : (
              <p className="text-sm whitespace-pre-line">{note.description ?? note.title}</p>
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
