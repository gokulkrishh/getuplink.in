import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { NamePlace } from "@/components/name-place";
import { googleMapsUrl } from "@/lib/charge-names";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadUserPlaces } from "@/lib/server/user-places";
import { TAG_RADIUS_M, type UserPlace } from "@/lib/user-places";

// The owner's tags, in the same private cache as the rest of Settings (see loadSettings in page.tsx).
async function loadYourPlaces(): Promise<UserPlace[]> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return loadUserPlaces(owner);
}

// Your places: every name the owner gave a spot, each with a rename or remove (the same sheet as on the
// pages), and a link to the spot.
export async function YourPlaces() {
  const places = await loadYourPlaces();
  return (
    <div className="py-4">
      <p className="text-sm text-muted-foreground">
        {places.length === 0 ? "None yet. Name a place from Driving, a trip or a charge." : `Used for every visit and charge within ${TAG_RADIUS_M} m.`}
      </p>
      {places.length > 0 && (
        <ul className="mt-3 divide-y border-t">
          {places.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="flex shrink-0 items-center gap-3">
                <a href={googleMapsUrl(p)} target="_blank" rel="noopener" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Map
                </a>
                <NamePlace target={{ lat: p.lat, lng: p.lng, tag: { id: p.id, name: p.name } }} compact />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
