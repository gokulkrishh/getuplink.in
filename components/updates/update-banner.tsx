import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatKm } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { isPending } from "./update-status";

// "2026.40.2 available"; while it moves, "Downloading 2026.40.2" with "43%" apart, so the number stays in
// view when the version is cut short on a phone.
export function bannerText(s: Snapshot): { text: string; progress: string | null } {
  const version = s.update_version ?? "An update";
  switch (s.update_status) {
    case "downloading":
      return { text: `Downloading ${version}`, progress: s.download_perc != null ? `${s.download_perc}%` : null };
    case "installing":
      return { text: `Installing ${version}`, progress: s.install_perc != null ? `${s.install_perc}%` : null };
    case "downloading_wifi_wait":
      return { text: `${version} is waiting for Wi-Fi`, progress: null };
    case "scheduled":
      return { text: `${version} is scheduled`, progress: null };
    default:
      return { text: `${version} available`, progress: null };
  }
}

// The car's software on the home page, opening /updates for the details: the version it runs and the
// odometer on one line, and a line for an update that is pending. Nothing when neither is known.
// `installed` is the version the car runs now (see isPending); `version` is the one to show (see
// currentVersion), `odometerKm` is known for the primary car only.
export function UpdateBanner({
  snapshot,
  installed,
  version,
  odometerKm,
}: {
  snapshot: Snapshot | null;
  installed: string | null;
  version: string | null;
  odometerKm: number | null;
}) {
  const pending = snapshot !== null && isPending(snapshot, installed) ? bannerText(snapshot) : null;
  if (!version && !pending) return null;
  const moving = snapshot?.update_status === "downloading" || snapshot?.update_status === "installing";
  return (
    <Link
      href="/updates"
      prefetch={true}
      className="group flex items-center justify-between gap-4 border px-4 py-3 text-sm transition-colors duration-150 hover:border-muted-foreground/50"
    >
      {/* Progress moves while it downloads or installs, so the page keeps itself fresh. */}
      {moving && <AutoRefresh />}
      <span className="min-w-0 space-y-1">
        {version && (
          <span className="flex items-center gap-2 tabular-nums">
            <span className="truncate font-mono">{version}</span>
            {odometerKm !== null && <span className="shrink-0 text-muted-foreground">· {formatKm(odometerKm)}</span>}
          </span>
        )}
        {pending && (
          <span className="flex items-center gap-2 tabular-nums">
            {snapshot?.update_status === "available" && (
              <span className="relative flex size-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-positive" />
              </span>
            )}
            <span className="truncate">{pending.text}</span>
            {pending.progress && <span className="shrink-0">· {pending.progress}</span>}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        Details
        <ChevronRight className="size-3" aria-hidden="true" />
      </span>
    </Link>
  );
}
