// Mark: a "U" whose right stroke rises into an arrow — Uplink.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        d="M8 7v11a7 7 0 0 0 14 0V4M17 9l5-5 5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}
