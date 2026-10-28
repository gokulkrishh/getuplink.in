"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LoadMore, Paged } from "@/lib/list";

// A long list's rows as the browser holds them: the first page the server sent, then the rest fetched the
// first time "Show N more" is tapped (see Paged). "Show less" folds them away; opening again reuses them.
// Draw `button` below the list, outside any ScrollX, so a sideways scrollbar never sits on it.
export function usePaged<T>({ rows: first, total }: Paged<T>, load: LoadMore<T>) {
  const [rest, setRest] = useState<T[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const toggle = () => {
    if (open) return setOpen(false);
    if (rest) return setOpen(true);
    start(async () => {
      try {
        setRest(await load(first.length));
        setFailed(false);
        setOpen(true);
      } catch {
        setFailed(true);
      }
    });
  };
  const more = total - first.length;
  return {
    rows: open && rest ? [...first, ...rest] : first,
    button: more > 0 ? <ShowMoreButton count={more} open={open} pending={pending} failed={failed} onToggle={toggle} /> : null,
  };
}

// The button, right-aligned under its list.
export function ShowMoreButton({ count, open, pending = false, failed = false, onToggle }: { count: number; open: boolean; pending?: boolean; failed?: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {/* While the rest loads, a spinner beside the button says something is happening. */}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />}
      <Button type="button" variant="ghost" size="xs" className="-mr-2" aria-expanded={open} disabled={pending} onClick={onToggle}>
        {pending ? "Loading…" : failed ? "Couldn't load. Try again" : open ? "Show less" : `Show ${count} more`}
      </Button>
    </div>
  );
}
