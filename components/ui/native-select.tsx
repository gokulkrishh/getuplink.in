import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// The browser's own <select>, with the browser's arrow swapped for ours: the native one sits hard against the
// right edge and differs per browser. The padding keeps the text clear of the arrow, which is set in from the
// edge like the input's text. Same height, border and focus ring as Input.
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-transparent pr-9 pl-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-10 md:text-sm dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}
