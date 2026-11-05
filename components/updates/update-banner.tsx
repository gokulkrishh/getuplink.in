import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatKm } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { isPending, LIVE_STATUSES, READY_STATUSES } from "./update-status";

// "2026.40.2 ready to install"; while it moves, "Downloading 2026.40.2" with "43%" apart, so the number stays
// in view when the version is cut short on a phone. The states are lib/telemetry.ts's UPDATE_FIELDS order.
export function bannerText(s: Snapshot): { text: string; progress: string | null } {
  const version = s.update_version ?? "An update";
  switch (s.update_status) {
    case "downloading":
      return { text: `Downloading ${version}`, progress: s.download_perc != null ? `${s.download_perc}%` : null };
    case "installing":
      return { text: `Installing ${version}`, progress: s.install_perc != null ? `${s.install_perc}%` : null };
    case "scheduled":
      return { text: `${version} scheduled`, progress: null };
    default:
      // available: only the states isPending lets through reach here (see update-status.tsx's STATUS).
      return { text: `${version} ready to install`, progress: null };
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
  const moving = LIVE_STATUSES.includes(snapshot?.update_status ?? "");
  // With no update on its way, the version is plain text: the header's Updates link opens the history.
  if (!pending)
    return version ? (
      <p className="flex items-center text-sm text-muted-foreground tabular-nums">
        <span className="truncate">{version}</span>
        {odometerKm !== null && <span className="shrink-0 whitespace-pre"> · {formatKm(odometerKm)}</span>}
      </p>
    ) : null;
  return (
    <Link
      href="/updates"
      prefetch={true}
      className="group flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm transition-colors duration-150 hover:border-muted-foreground/50"
    >
      {/* While the update is moving (see LIVE_STATUSES), the page keeps itself fresh. */}
      {moving && <AutoRefresh />}
      <span className="min-w-0 space-y-1">
        {version && (
          <span className="flex items-center tabular-nums">
            <span className="truncate">{version}</span>
            {odometerKm !== null && <span className="shrink-0 whitespace-pre text-muted-foreground"> · {formatKm(odometerKm)}</span>}
          </span>
        )}
        {pending && (
          <span className="flex items-center gap-2 tabular-nums">
            {READY_STATUSES.includes(snapshot?.update_status ?? "") && (
              <span className="relative flex size-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-positive" />
              </span>
            )}
            {/* Cut short only to keep a percent in view; without one the line wraps. */}
            <span className={pending.progress ? "truncate" : "min-w-0 text-pretty"}>{pending.text}</span>
            {pending.progress && <span className="shrink-0">· {pending.progress}</span>}
          </span>
        )}
      </span>
      {/* The line itself is the link to Updates; a chevron says so. */}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}
