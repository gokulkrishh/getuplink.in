import "server-only";
import { messageOf } from "@/lib/errors";
import { hasUpdateNews, type LastCheck, UPDATE_NEWS_FIELDS } from "@/lib/update-news";
import { ownerDb, type Owner } from "./data/owner";
import { loadStream } from "./telemetry";

// The owners with a car whose stream has update news to ask Tesla about (see lib/update-news.ts). Reads each
// owner's own cars, latest check and stream only; never asks Tesla. A read that fails leaves that owner out.
export async function ownersWithUpdateNews(owners: Owner[], now: number): Promise<Owner[]> {
  const found = await Promise.all(
    owners.map(async (owner) => {
      try {
        const scope = ownerDb(owner);
        const { data, error } = await scope.from("vehicles").select("id:id::text, vin").not("vin", "is", null).is("readings_until", null);
        if (error) throw new Error(error.message);
        for (const car of (data ?? []) as { id: string; vin: string }[]) {
          const [stream, last] = await Promise.all([
            loadStream(owner, car.vin, UPDATE_NEWS_FIELDS),
            scope.from("snapshots").select("polled_at, update_version, download_perc").eq("vehicle_id", car.id).order("polled_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (last.error) throw new Error(last.error.message);
          const row = last.data as { polled_at: string; update_version: string | null; download_perc: number | null } | null;
          const check: LastCheck | null = row ? { at: row.polled_at, version: row.update_version, downloadPerc: row.download_perc } : null;
          if (hasUpdateNews(stream, check, now)) return true;
        }
      } catch (err) {
        console.warn("Update news: reading a car failed:", messageOf(err));
      }
      return false;
    }),
  );
  return owners.filter((_, i) => found[i]);
}
