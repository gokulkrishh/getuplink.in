import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Fragment } from "react";
import type { ReleaseNote, ReleaseNotesByVersion } from "@/lib/release-notes";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Tesla's notes for one version as a quiet changelog: category on the left, the change on the right.
// `stacked` keeps the category above the change at every width, for narrow columns.
export function ReleaseNotesList({ notes, stacked = false }: { notes: ReleaseNote[]; stacked?: boolean }) {
  return (
    <dl className={cn("mt-3 grid gap-x-6 gap-y-4 border-l pl-4", !stacked && "grid-cols-notes")}>
      {notes.map((note, i) => (
        <Fragment key={`${note.title}-${i}`}>
          <dt className={cn("text-xs text-muted-foreground", !stacked && "sm:pt-0.5")}>{note.title}</dt>
          <dd className={cn("-mt-3 space-y-1", !stacked && "sm:mt-0")}>
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

// "Release notes ▸", opening the version's notes in place. Nothing when Tesla published none.
export function ReleaseNotesToggle({
  version,
  notes,
  stacked = false,
}: {
  version: string;
  notes: ReleaseNotesByVersion;
  stacked?: boolean;
}) {
  if (!notes[version]) return null;
  return (
    <Collapsible className="group/notes">
      <CollapsibleTrigger
        aria-label={`Release notes for ${version}`}
        className={buttonVariants({ variant: "ghost", size: "xs", className: "-ml-2 group-data-open/notes:text-foreground" })}
      >
        Release notes
        <ChevronRight className="transition-transform group-data-open/notes:rotate-90" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ReleaseNotesList notes={notes[version]} stacked={stacked} />
      </CollapsibleContent>
    </Collapsible>
  );
}
