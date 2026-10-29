"use client";

import { ChartCard } from "@/components/chart-card";
import { VersionChart } from "@/components/version-chart";

// Real Tesla versions (from Tesla's release list); dates are illustrative.
const PREVIEW_HISTORY = [
  { version: "2026.20.6.10", detected_at: "2026-06-25T05:00:00Z" },
  { version: "2026.26.6", detected_at: "2026-08-02T05:00:00Z" },
  { version: "2026.32.3", detected_at: "2026-09-07T05:00:00Z" },
  { version: "2026.38.3.1", detected_at: "2026-10-15T05:00:00Z" },
];

// The dashboard's own history chart in the home page's preview, so hovering shows each version and date.
// Its own chunk (see DashboardPreview), so the card's ⓘ popover code isn't in the home page's first load.
export default function PreviewChart() {
  return (
    <ChartCard as="h3" title="Software version" description="Each step up is a new version arriving.">
      <VersionChart changes={PREVIEW_HISTORY} until="2026-10-21T04:00:00Z" />
    </ChartCard>
  );
}
