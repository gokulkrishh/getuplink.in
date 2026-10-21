// Mark: a solid square with an "update" arrow rising onto a baseline.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" fill="var(--background)" />
      <path d="M16 21V9M10.5 14.5 16 9l5.5 5.5M10 24h12" fill="none" stroke="var(--foreground)" strokeWidth="2.5" />
    </svg>
  );
}
