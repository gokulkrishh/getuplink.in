// Mark: a "U" whose right stroke rises into an arrow — Uplink.
import { LOGO_PATH } from "@/lib/logo";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        d={LOGO_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}
