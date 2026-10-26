"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { UNIT_WORDS } from "@/lib/unit-words";
import { cn } from "@/lib/utils";

// Whether the pointer can hover (a mouse), so a phone's emulated hover never opens and then a tap shuts it.
const HOVER = "(hover: hover) and (pointer: fine)";
function subscribe(change: () => void) {
  const query = window.matchMedia(HOVER);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const canHover = () => window.matchMedia(HOVER).matches;

// The ⓘ beside a chart's or tile group's title (see docs/charts.md). It opens a small popover with any
// method notes passed as children, then the plain words for each unit or term (from the glossary,
// lib/unit-words.ts). Hover or keyboard focus opens it on a desktop, a tap on a phone; a tap outside or Esc closes
// it. `label` names what it's about ("Parked drain") for screen readers. Renders nothing when there's
// nothing to say.
export function InfoButton({
  label,
  terms = [],
  children,
  className,
}: {
  label: string;
  terms?: (string | undefined)[];
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const hover = useSyncExternalStore(subscribe, canHover, () => false);
  const words = [...new Set(terms)].flatMap((t) => (t && UNIT_WORDS[t] ? [UNIT_WORDS[t]] : []));
  if (words.length === 0 && !children) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover={hover}
        delay={150}
        aria-label={`About ${label}`}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={(e) => !popup.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget && setOpen(false)}
        className={cn(
          "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:text-foreground after:absolute after:-inset-1",
          className,
        )}
      >
        <Info className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-50">
          {/* Only words inside, so focus stays on the ⓘ throughout: Tab moves on (closing it, see onBlur), and
              closing never hands focus back, which would reopen it or trap Tab. */}
          <Popover.Popup ref={popup} initialFocus={false} finalFocus={false} className="w-80 max-w-[calc(100vw-2rem)] space-y-2 border bg-popover p-3 text-sm leading-5 text-popover-foreground shadow-md outline-none">
            {typeof children === "string" ? <p>{children}</p> : children}
            {words.map((w) => (
              <p key={w}>{w}.</p>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
