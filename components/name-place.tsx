"use client";

import { Popover } from "@base-ui/react/popover";
import { Pencil } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { placeSuggestions, removePlace, savePlace } from "@/app/places/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Suggestion } from "@/lib/place-suggestions";
import { NAME_MAX, type NameTarget, TAG_RADIUS_M } from "@/lib/user-places";
import { cn } from "@/lib/utils";

type Loaded = { items: Suggestion[]; google: boolean } | null;

// "Name this place": a small sheet with suggestions for the spot (asked for when it opens, never before)
// and a name field. A tapped suggestion fills the field; saving keeps the name in Your places, for every
// visit and charge within TAG_RADIUS_M. With a tag already, it renames or removes it. `compact` shows a
// pencil instead of the words, for rows that already have a name.
export function NamePlace({ target, compact = false, className }: { target: NameTarget; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [loading, startLoading] = useTransition();
  const [name, setName] = useState(target.tag?.name ?? "");
  // The Google suggestion the field holds, while it's unchanged.
  const [picked, setPicked] = useState<Suggestion | null>(null);
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
        setLoaded(await placeSuggestions(target.lat, target.lng).catch(() => ({ items: [], google: false })));
      });
  };
  // The field holds at most NAME_MAX characters, so the kept suggestion is compared as cut.
  const pick = (s: Suggestion) => {
    const cut = { ...s, name: s.name.slice(0, NAME_MAX) };
    setName(cut.name);
    setPicked(cut.placeId ? cut : null);
  };
  const title = target.tag ? "Rename this place" : "Name this place";
  const shown = loaded?.items ?? [];
  const google = shown.some((s) => s.source === "google");
  const osm = shown.some((s) => s.source !== "google");
  const error = saveError ?? removeError;

  return (
    <Popover.Root open={open} onOpenChange={opened}>
      <Popover.Trigger
        aria-label={compact ? title : undefined}
        className={cn(
          compact
            ? "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring after:absolute after:-inset-1"
            : "text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        {compact ? <Pencil className="size-3.5" aria-hidden="true" /> : "Name this place"}
      </Popover.Trigger>
      <Popover.Portal>
        {/* Always below its trigger, never flipped up: Google's suggestions must not sit over our
            (non-Google) map, which is above every trigger on its page. The page scrolls to the rest. */}
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          className="z-50"
        >
          <Popover.Popup className="w-80 max-w-[calc(100vw-2rem)] space-y-3 border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none">
            <Popover.Title className="font-medium">{title}</Popover.Title>
            {loading && <p className="text-xs text-muted-foreground">Finding nearby names…</p>}
            {shown.length > 0 && (
              <div>
              <ul className="-mx-1 max-h-40 overflow-y-auto sm:max-h-56" aria-label="Suggestions">
                {shown.map((s) => (
                  <li key={`${s.source}:${s.name}`}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      aria-pressed={name === s.name}
                      className="w-full rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-pressed:bg-muted"
                    >
                      <span className="block truncate">{s.name}</span>
                      {s.detail && <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {/* Right under the suggestions, so it is always in view with them. */}
              <p className="mt-1 text-[0.7rem] leading-4 text-faint">
                {google && <span translate="no">Google Maps</span>}
                {google && osm && " · "}
                {osm && (
                  <>
                    ©{" "}
                    <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2 hover:text-foreground">
                      OpenStreetMap contributors
                    </a>
                  </>
                )}
              </p>
              </div>
            )}
            <form action={save} className="space-y-2">
              {target.tag ? <input type="hidden" name="id" value={target.tag.id} /> : null}
              <input type="hidden" name="lat" value={target.lat} />
              <input type="hidden" name="lng" value={target.lng} />
              {picked && picked.name === name && picked.placeId ? <input type="hidden" name="placeId" value={picked.placeId} /> : null}
              <label className="sr-only" htmlFor={`place-name-${target.lat}-${target.lng}`}>
                Name
              </label>
              <Input
                id={`place-name-${target.lat}-${target.lng}`}
                name="name"
                value={name}
                maxLength={NAME_MAX}
                placeholder="Name"
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
