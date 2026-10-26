"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Pencil, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { placeSuggestions, removePlace, savePlace } from "@/app/places/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_SUGGESTIONS, type Suggestions } from "@/lib/place-suggestions";
import { NAME_MAX, type NameTarget, TAG_RADIUS_M } from "@/lib/user-places";
import { cn } from "@/lib/utils";

// "Name this place": a full-screen sheet over an opaque backdrop, so nothing from Google ever shows beside
// our map (docs/place-names.md). The owner types the name. OpenStreetMap's suggestions (a station, the
// area) fill the field with a tap; Google's are hints only, read-only, with its attribution. Suggestions
// are asked for when the sheet opens, never before. Saving keeps the name in Your places, for every visit
// and charge within TAG_RADIUS_M; with a tag already, it renames or removes it. `compact` shows a pencil
// instead of the words, for rows that already have a name.
export function NamePlace({ target, compact = false, className }: { target: NameTarget; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Suggestions | null>(null);
  const [loading, startLoading] = useTransition();
  const [name, setName] = useState(target.tag?.name ?? "");
  const [saveError, save, saving] = useActionState(async (prev: string | null, form: FormData) => {
    const error = await savePlace(prev, form);
    if (!error) setOpen(false);
    return error;
  }, null);
  const [removeError, remove, removing] = useActionState(async (prev: string | null, form: FormData) => {
    const error = await removePlace(prev, form);
    if (!error) setOpen(false);
    return error;
  }, null);

  const opened = (next: boolean) => {
    setOpen(next);
    if (next && loaded === null && !loading)
      startLoading(async () => {
        setLoaded(await placeSuggestions(target.lat, target.lng).catch(() => NO_SUGGESTIONS));
      });
  };
  const title = target.tag ? "Rename this place" : "Name this place";
  const picks = loaded?.picks ?? [];
  const hints = loaded?.hints ?? [];
  const error = saveError ?? removeError;
  const fieldId = `place-name-${target.lat}-${target.lng}`;

  return (
    <Dialog.Root open={open} onOpenChange={opened}>
      <Dialog.Trigger
        aria-label={compact ? title : undefined}
        className={cn(
          compact
            ? "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring after:absolute after:-inset-1"
            : "text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        {compact ? <Pencil className="size-3.5" aria-hidden="true" /> : "Name this place"}
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* Opaque: the page, and its map, are hidden while the sheet is open. */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background" />
        <Dialog.Popup className="fixed inset-0 z-50 overflow-y-auto bg-background text-sm text-foreground outline-none">
          <div className="mx-auto w-full max-w-md space-y-6 px-4 pt-6 pb-12 sm:pt-16">
            <div className="flex items-center justify-between gap-4">
              <Dialog.Title className="text-lg font-medium tracking-heading">{title}</Dialog.Title>
              <Dialog.Close aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <form action={save} className="space-y-2">
              {target.tag ? <input type="hidden" name="id" value={target.tag.id} /> : null}
              <input type="hidden" name="lat" value={target.lat} />
              <input type="hidden" name="lng" value={target.lng} />
              <label className="sr-only" htmlFor={fieldId}>
                Name
              </label>
              <Input id={fieldId} name="name" value={name} maxLength={NAME_MAX} placeholder="Name" autoComplete="off" onChange={(e) => setName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Used for every visit within {TAG_RADIUS_M} m.</p>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                {target.tag ? (
                  <Button type="submit" formAction={remove} variant="destructiveGhost" size="sm" disabled={removing || saving}>
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" size="sm" disabled={saving || removing || name.trim() === ""}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>

            {loading && <p className="text-xs text-muted-foreground">Finding nearby names…</p>}

            {picks.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-xs text-faint">From OpenStreetMap</h3>
                <ul className="-mx-1">
                  {picks.map((s) => (
                    <li key={`${s.source}:${s.name}`}>
                      <button
                        type="button"
                        onClick={() => setName(s.name.slice(0, NAME_MAX))}
                        aria-pressed={name === s.name.slice(0, NAME_MAX)}
                        className="w-full rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-pressed:bg-muted"
                      >
                        <span className="block truncate">{s.name}</span>
                        {s.detail && <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[0.7rem] leading-4 text-faint">
                  ©{" "}
                  <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2 hover:text-foreground">
                    OpenStreetMap contributors
                  </a>
                </p>
              </section>
            )}

            {hints.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-xs text-faint">Nearby on Google Maps</h3>
                <ul className="-mx-1">
                  {hints.map((s) => (
                    <li key={s.name} className="px-1 py-1.5">
                      <span className="block truncate">{s.name}</span>
                      {s.detail && <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-[0.7rem] leading-4 text-faint" translate="no">
                  Google Maps
                </p>
              </section>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
