import { compareVersions } from "@/lib/rollout";
import type { Stream } from "@/lib/telemetry";
import { normaliseVersion } from "@/lib/versions";

// When the car streams news about an update, Uplink asks Tesla why it isn't offered yet (waiting for Wi-Fi,
// downloading, scheduled), by running a check: vehicle_data's software_update.status is the only place that
// says. Fleet Telemetry can't: on 5 Nov 2026 its download percent went 0% to 100% while the car's screen said
// to connect to Wi-Fi (see lib/telemetry.ts's UPDATE_FIELDS). The check never wakes the car: it reads
// vehicle_data only for a car Tesla lists as online (lib/server/poll.ts).

// At most one such check per account this often (claim_check_now's gap, shared with the check after a sign-in).
export const UPDATE_CHECK_GAP_MS = 30 * 60_000;
// News older than this is from a car that has likely gone back to sleep: asking then would find it asleep.
// The 15-minute cron sees each reading at least once inside it.
export const UPDATE_NEWS_FRESH_MS = 20 * 60_000;

export const UPDATE_NEWS_FIELDS = ["SoftwareUpdateVersion", "SoftwareUpdateDownloadPercentComplete", "Version"];

// The car's latest check: when (any state), and the update it saw.
export type LastCheck = { at: string; version: string | null; downloadPerc: number | null };

// True when this car's stream has update news the latest check hasn't asked Tesla about, it is fresh, and no
// check ran in the last UPDATE_CHECK_GAP_MS. News: a version (not blank, newer than the installed Version)
// the check didn't see, or a download percent sent after the check that differs from Tesla's own.
export function hasUpdateNews(stream: Stream, last: LastCheck | null, now: number): boolean {
  const offered = stream.SoftwareUpdateVersion;
  const version = typeof offered?.value === "string" ? normaliseVersion(offered.value) : null;
  if (!offered || !version) return false;
  const installed = typeof stream.Version?.value === "string" ? normaliseVersion(stream.Version.value) : null;
  if (installed && compareVersions(version, installed) <= 0) return false;
  const lastAt = last ? Date.parse(last.at) : null;
  if (lastAt !== null && now - lastAt < UPDATE_CHECK_GAP_MS) return false;

  const after = (at: string) => lastAt === null || Date.parse(at) > lastAt;
  const fresh = (at: string) => now - Date.parse(at) <= UPDATE_NEWS_FRESH_MS;
  const newVersion = after(offered.at) && fresh(offered.at) && normaliseVersion(last?.version) !== version;
  const download = stream.SoftwareUpdateDownloadPercentComplete;
  const moved = !!download && typeof download.value === "number" && after(download.at) && fresh(download.at) && Math.round(download.value) !== last?.downloadPerc;
  return newVersion || moved;
}
