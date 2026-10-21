// A simple line drawing of a two-door robotaxi in profile (teardrop roof, short nose, covered wheels).
export function CybercabGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Body: low nose, long arched roof, rounded tail */}
      <path d="M3 20.5C3 17.2 6.5 15.6 13.5 14.6C21.5 7.2 37.5 4.8 49 8.4C56 10.6 61 14.8 61 20.5" />
      {/* Sills between the wheels */}
      <path d="M3 20.5H9.5M20.5 20.5H43.5M54.5 20.5H61" />
      {/* Glasshouse */}
      <path d="M18.5 13.8C25.5 9.6 36.5 8.6 45.5 11L43.5 13.8Z" />
      {/* Covered wheels */}
      <circle cx="15" cy="21" r="4.5" />
      <circle cx="49" cy="21" r="4.5" />
      {/* Light bar */}
      <path d="M57.5 13.8H60.2" />
    </svg>
  );
}
