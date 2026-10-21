import { VersionChart } from "@/components/version-chart";

// Real Tesla versions (from Tesla's release list); dates are illustrative.
const PREVIEW_HISTORY = [
  { version: "2026.20.6.10", detected_at: "2026-06-25T05:00:00Z" },
  { version: "2026.26.6", detected_at: "2026-08-02T05:00:00Z" },
  { version: "2026.32.3", detected_at: "2026-09-07T05:00:00Z" },
  { version: "2026.38.3.1", detected_at: "2026-10-15T05:00:00Z" },
];

// Static illustration of the dashboard. Used on the sign-in page and the home page; reads no data. Only the chart is interactive.
export function DashboardPreview() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm border-l pl-6 text-left select-none sm:pl-8">
      <p className="text-xs text-faint">Model Y</p>
      <p className="mt-1 font-mono text-4xl font-medium tracking-tight tabular-nums">2026.38.3.1</p>
      <div className="mt-8 flex items-baseline justify-between text-sm">
        <span>
          Downloading <span className="ml-1 font-mono text-muted-foreground">2026.38.5.1</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">42%</span>
      </div>
      {/* Same bar as the dashboard's update progress, shimmer included. */}
      <div className="mt-2 h-1 overflow-hidden bg-border">
        <div className="relative h-full overflow-hidden bg-foreground" style={{ width: "42%" }}>
          <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
        </div>
      </div>
      {/* The dashboard's own history chart, so hovering shows each version and date. */}
      <div className="mt-8">
        <VersionChart changes={PREVIEW_HISTORY} until="2026-10-21T04:00:00Z" />
      </div>
      <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">Last seen 9:15 AM IST</p>
    </div>
  );
}
