"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, Pencil, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { placeSuggestions, removePlace, savePlace } from "@/app/places/actions";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { Ph } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { matches, NO_SUGGESTIONS, parseQuery, type Suggestion, type Suggestions } from "@/lib/place-suggestions";
import { NAME_MAX, type NameTarget, TAG_RADIUS_M } from "@/lib/user-places";
import { cn } from "@/lib/utils";

// Wait for a pause in typing before asking Google: each request is billed.
const DEBOUNCE_MS = 300;
const MAX_GOOGLE = 8;

type Option = { key: string; kind: "typed" | "osm" | "google"; name: string; detail: string | null; placeId?: string };
type Remote = { q: string; results: Suggestion[]; unavailable: boolean };

// One Autocomplete session per search: a new token when the sheet opens and after each pick.
function newToken(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

const squeeze = (s: string) => s.replace(/\s+/g, " ").trim();

// "Name this place": a full-screen sheet over an opaque backdrop, so nothing from Google ever shows beside
// our map (docs/place-names.md). One search field (an ARIA combobox) with the choices under it:
// - Before typing: OpenStreetMap's stations and area, and Google's nearby places.
// - While typing: the typed text as a name of its own, the nearby ones that match, and Google
//   Autocomplete's places near the pin (app/api/places/autocomplete), after a pause and 2 characters.
// Picking a choice saves it. A Google place saves only its place ID; its name never goes into the field.
// With a tag already, it renames or removes it. `compact` shows a pencil, for rows that have a name.
export function NamePlace({ target, compact = false, className }: { target: NameTarget; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Suggestions | null>(null);
  const [loading, startLoading] = useTransition();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const token = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const reset = () => {
    setQuery("");
    setActive(-1);
    setRemote(null);
    setError(null);
    token.current = newToken();
  };
  const opened = (next: boolean, details: Dialog.Root.ChangeEventDetails) => {
    // Escape clears the search first; a second Escape closes.
    if (!next && details.reason === "escape-key" && (query !== "" || active >= 0)) {
      setQuery("");
      setActive(-1);
      return;
    }
    if (next) reset();
    setOpen(next);
    if (next && loaded === null && !loading)
      startLoading(async () => {
        setLoaded(await placeSuggestions(target.lat, target.lng, target.tag?.id).catch(() => NO_SUGGESTIONS));
      });
  };

  const q = squeeze(query);
  const searchable = (loaded?.search ?? false) && parseQuery(q) !== null;

  useEffect(() => {
    if (!open || !searchable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, lat: target.lat, lng: target.lng, token: token.current }),
          signal: ctrl.signal,
        });
        const body = res.ok ? ((await res.json()) as Omit<Remote, "q">) : { results: [], unavailable: true };
        setRemote({ q, results: body.results ?? [], unavailable: body.unavailable === true });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setRemote({ q, results: [], unavailable: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, searchable, q, target.lat, target.lng]);

  const tappable = loaded?.tappable ?? false;
  const osm: Option[] = (loaded?.picks ?? [])
    .filter((s) => q === "" || matches(s, q))
    .map((s) => ({ key: `osm:${s.name}`, kind: "osm", name: s.name.slice(0, NAME_MAX), detail: s.detail }));
  // While a new answer is on its way, the last one stays, narrowed to what still matches.
  const fromSearch = searchable && remote ? remote.results.filter((s) => remote.q === q || matches(s, q)) : [];
  const nearbyGoogle = (loaded?.hints ?? []).filter((s) => q === "" || matches(s, q));
  const seen = new Set<string>();
  const google: Option[] = [];
  for (const s of tappable ? [...nearbyGoogle, ...fromSearch] : []) {
    if (!s.placeId || seen.has(s.placeId) || google.length >= MAX_GOOGLE) continue;
    seen.add(s.placeId);
    google.push({ key: `google:${s.placeId}`, kind: "google", name: s.name, detail: s.detail, placeId: s.placeId });
  }
  const typed: Option[] = q !== "" && !osm.some((o) => o.name.toLowerCase() === q.toLowerCase()) ? [{ key: "typed", kind: "typed", name: q, detail: null }] : [];
  const options = [...typed, ...osm, ...google];
  const searching = searchable && remote?.q !== q;
  const unavailable = searchable && remote?.q === q && remote.unavailable;

  const isCurrent = (o: Option) =>
    o.kind === "google" ? o.placeId === target.tag?.googlePlaceId : o.kind === "osm" && target.tag?.name?.toLowerCase() === o.name.toLowerCase();

  const choose = (o: Option) => {
    if (saving) return;
    const form = new FormData();
    if (target.tag) form.set("id", String(target.tag.id));
    form.set("lat", String(target.lat));
    form.set("lng", String(target.lng));
    if (o.kind === "google" && o.placeId) form.set("googlePlaceId", o.placeId);
    else form.set("name", o.name);
    startSaving(async () => {
      const err = await savePlace(null, form).catch(() => "Couldn't save. Try again in a moment.");
      setError(err);
      if (!err) setOpen(false);
      // The search that led here is over.
      token.current = newToken();
    });
  };
  const remove = () => {
    if (!target.tag || saving) return;
    const form = new FormData();
    form.set("id", String(target.tag.id));
    startSaving(async () => {
      const err = await removePlace(null, form).catch(() => "Couldn't remove. Try again in a moment.");
      setError(err);
      if (!err) setOpen(false);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // An IME's Enter only commits the composed text.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (options.length === 0 ? -1 : i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active] ?? typed[0];
      if (o) choose(o);
    }
  };

  const optionId = (i: number) => `${id}-option-${i}`;
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  const title = target.tag ? "Rename this place" : "Name this place";
  const current = target.tag?.name ?? loaded?.current ?? null;
  const listId = `${id}-list`;
  const status = saving
    ? "Saving…"
    : loading
      ? "Finding nearby places…"
      : unavailable
        ? "Search isn't available right now."
        : searching
          ? "Searching…"
          : q !== "" && options.length === typed.length
            ? "No places match."
            : "";

  // Until the first answer is in, the list is drawn as grey bars in the shape of what arrives (two groups of
  // two-line rows), so the footer below barely moves. Not while typing: a typed name is already a choice.
  const waiting = open && loading && loaded === null && q === "";
  const skeletonGroup = (label: string, names: string[]) => (
    <div className="border-t pt-2">
      <div className="px-2 pb-1 text-xs">
        <Ph>{label}</Ph>
      </div>
      {names.map((name) => (
        <div key={name} className="px-2 py-2">
          <span className="block truncate">
            <Ph>{name}</Ph>
          </span>
          <span className="block truncate text-xs">
            <Ph>Kind of place</Ph>
          </span>
        </div>
      ))}
    </div>
  );

  const row = (o: Option, i: number) => (
    <div
      key={o.key}
      id={optionId(i)}
      role="option"
      aria-selected={i === active}
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={() => i !== active && setActive(i)}
      onClick={() => choose(o)}
      className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2 py-2", i === active && "bg-muted")}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{o.kind === "typed" ? `Use “${o.name}”` : o.name}</span>
        {o.detail && <span className="block truncate text-xs text-muted-foreground">{o.detail}</span>}
      </span>
      {isCurrent(o) && (
        <>
          <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Current</span>
        </>
      )}
    </div>
  );
  const group = (key: string, label: string, credit: React.ReactNode, list: Option[], offset: number) =>
    list.length > 0 && (
      <div role="group" aria-labelledby={`${id}-${key}`} className="border-t pt-2">
        <div className="flex items-baseline justify-between gap-2 px-2 pb-1">
          <span id={`${id}-${key}`} className="text-xs text-faint">
            {label}
          </span>
          {credit}
        </div>
        {list.map((o, k) => row(o, offset + k))}
      </div>
    );

  return (
    <Dialog.Root open={open} onOpenChange={opened}>
      <Dialog.Trigger
        aria-label={compact ? title : undefined}
        className={cn(
          compact
            ? "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring after:absolute after:-inset-1"
            : "tap-target text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        {compact ? <Pencil className="size-3.5" aria-hidden="true" /> : "Name this place"}
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* Opaque: the page, and its map, are hidden while the sheet is open. */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background" />
        <Dialog.Popup initialFocus={input} className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain bg-background text-sm text-foreground outline-none">
          <div className="mx-auto w-full max-w-md space-y-4 px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] sm:pt-16">
            <div className="flex items-center justify-between gap-4">
              <Dialog.Title className="text-lg font-medium tracking-heading">{title}</Dialog.Title>
              <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close" className="-mt-1 -mr-2 text-muted-foreground" />} nativeButton>
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            {current && (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">Now</span>
                <span>{current}</span>
                {!target.tag?.name && <GoogleMapsCredit />}
              </p>
            )}

            <div className="space-y-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                <Input
                  ref={input}
                  type="text"
                  role="combobox"
                  aria-label="Search or type a name"
                  aria-expanded={options.length > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  aria-describedby={`${id}-hint`}
                  value={query}
                  maxLength={NAME_MAX}
                  placeholder="Search or type a name"
                  enterKeyHint="done"
                  spellCheck={false}
                  {...NO_AUTOFILL}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(-1);
                    setError(null);
                  }}
                  onKeyDown={onKeyDown}
                  readOnly={saving}
                  aria-busy={saving}
                  className="pr-9 pl-8"
                />
                {query !== "" && (
                  <button
                    type="button"
                    aria-label="Clear"
                    onClick={() => {
                      setQuery("");
                      setActive(-1);
                      input.current?.focus();
                    }}
                    className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center text-faint transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
  
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : (
                <p role="status" className="min-h-4 text-sm text-muted-foreground">
                  {status}
                </p>
              )}
            </div>

            <div id={listId} role="listbox" aria-label="Places" aria-busy={waiting} className={cn("space-y-3 empty:hidden", saving && "pointer-events-none opacity-60")}>
              {waiting && (
                <div aria-hidden="true" className="space-y-3">
                  {skeletonGroup("Stations and area", ["Station name here", "Area name here"])}
                  {skeletonGroup("Places", ["Place name here", "Another place name", "A third place name"])}
                </div>
              )}
              {typed.length > 0 && <div className="border-t pt-2">{row(typed[0], 0)}</div>}
              {group(
                "osm",
                "Stations and area",
                <a href="https://www.openstreetmap.org/copyright" className="text-xs text-faint underline-offset-2 hover:text-foreground hover:underline">
                  © OpenStreetMap contributors
                </a>,
                osm,
                typed.length,
              )}
              {group("google", "Places", <GoogleMapsCredit />, google, typed.length + osm.length)}
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <p id={`${id}-hint`} className="text-sm text-faint">
                Used for every visit within {TAG_RADIUS_M} m.
              </p>
              {target.tag && (
                <Button type="button" variant="destructiveGhost" size="sm" disabled={saving} onClick={remove}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
