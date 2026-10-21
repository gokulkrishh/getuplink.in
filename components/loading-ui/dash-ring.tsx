"use client";

// From loading-ui.com (Dash Ring), https://www.loading-ui.com/docs/components/dash-ring
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type DashRingProps = React.ComponentProps<"svg">;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (fn: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", fn);
  return () => query.removeEventListener("change", fn);
};

// Purely decorative: callers put the accessible "busy" state on the control around it. SMIL ignores
// prefers-reduced-motion, so the animation elements are left out and a still arc is drawn instead.
function DashRing({ className, ...props }: DashRingProps) {
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        opacity="0.1"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={reduced ? "42 150" : undefined}
      >
        {!reduced && (
          <>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-dasharray"
              values="0 150;42 150;42 150"
              keyTimes="0;0.5;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-dashoffset"
              values="0;-16;-59"
              keyTimes="0;0.5;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </>
        )}
      </circle>
    </svg>
  );
}

export { DashRing };
