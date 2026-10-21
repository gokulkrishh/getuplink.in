import type { ReactNode } from "react";

// A small label above an icon button, shown on hover or keyboard focus. The parent needs
// `group relative`. It sits out of flow, so showing it never moves anything; the button
// still needs its own aria-label, since this is hidden from screen readers.
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-full z-10 mb-1.5 bg-foreground px-2 py-1 text-xs font-normal whitespace-nowrap text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}
