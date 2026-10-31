"use client";

import { Info } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanHover } from "@/components/use-can-hover";
import { cn } from "@/lib/utils";

// The ⓘ beside a chart's or tile group's title (see docs/charts.md). It opens a small popover with the
// note passed as children: one or two sentences the page itself doesn't say. Hover or keyboard focus
// opens it on a desktop, a tap on a phone; a tap outside or Esc closes it. `label` names what it's about
// ("Parked drain") for screen readers. Renders nothing when there's nothing to say.
export function InfoButton({
  label,
  children,
  className,
}: {
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const hover = useCanHover();
  if (!children) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
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
      </PopoverTrigger>
      {/* shadcn's PopoverContent. Only words inside, so focus stays on the ⓘ throughout: Tab moves on (closing
          it, see onBlur), and closing never hands focus back, which would reopen it or trap Tab. */}
      <PopoverContent
        ref={popup}
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={16}
        initialFocus={false}
        finalFocus={false}
        className="w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border bg-popover p-3 text-sm leading-5 text-popover-foreground shadow-md ring-0"
      >
        {typeof children === "string" ? <p>{children}</p> : children}
      </PopoverContent>
    </Popover>
  );
}
