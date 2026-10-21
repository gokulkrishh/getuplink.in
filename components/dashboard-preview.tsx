// Static illustration of the dashboard. Used on the sign-in page and the home page; reads no data.
export function DashboardPreview() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm border-l pl-6 text-left select-none sm:pl-8">
      <p className="text-xs text-faint">Model Y</p>
      <p className="mt-1 font-mono text-4xl font-medium tracking-tight tabular-nums">2026.32.3</p>
      <div className="mt-8 flex items-baseline justify-between text-sm">
        <span>
          Downloading <span className="ml-1 font-mono text-muted-foreground">2026.38.3</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">42%</span>
      </div>
      <div className="mt-2 h-px bg-border">
        <div className="h-px w-[42%] bg-foreground" />
      </div>
      <svg viewBox="0 0 300 48" className="mt-8 h-12 w-full text-foreground" preserveAspectRatio="none">
        <path d="M0 44H70V34H150V22H232V10H300" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-3 flex justify-between text-xs text-faint">
        <span>Jul</span>
        <span>Aug</span>
        <span>Sep</span>
        <span>Oct</span>
      </div>
      <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">Last seen 9:15 AM IST</p>
    </div>
  );
}
