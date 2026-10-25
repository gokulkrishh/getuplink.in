import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import type { Snapshot } from "@/lib/server/dashboard";
import { isPending } from "./update-status";

// "2026.40.2 available", "Downloading 2026.40.2 · 43%".
function bannerText(s: Snapshot): string {
  const version = s.update_version ?? "An update";
  switch (s.update_status) {
    case "downloading":
      return `Downloading ${version}${s.download_perc != null ? ` · ${s.download_perc}%` : ""}`;
    case "installing":
      return `Installing ${version}${s.install_perc != null ? ` · ${s.install_perc}%` : ""}`;
    case "downloading_wifi_wait":
      return `${version} is waiting for Wi-Fi`;
    case "scheduled":
      return `${version} is scheduled`;
    default:
      return `${version} available`;
  }
}

// One line on the home page while an update is pending, opening /updates for the details. Nothing otherwise:
// a quietly installed update shows as the version changing.
// `installed` is the version the car runs now (see isPending).
export function UpdateBanner({ snapshot, installed }: { snapshot: Snapshot | null; installed: string | null }) {
  if (!snapshot || !isPending(snapshot, installed)) return null;
  const moving = snapshot.update_status === "downloading" || snapshot.update_status === "installing";
  return (
    <Link
      href="/updates"
      prefetch={true}
      className="group flex items-center justify-between gap-4 border px-4 py-3 text-sm transition-colors duration-150 hover:border-muted-foreground/50"
    >
      {/* Progress moves while it downloads or installs, so the page keeps itself fresh. */}
      {moving && <AutoRefresh />}
      <span className="flex min-w-0 items-center gap-2">
        {snapshot.update_status === "available" && (
          <span className="relative flex size-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-positive" />
          </span>
        )}
        <span className="truncate tabular-nums">{bannerText(snapshot)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        Details
        <ChevronRight className="size-3" aria-hidden="true" />
      </span>
    </Link>
  );
}
