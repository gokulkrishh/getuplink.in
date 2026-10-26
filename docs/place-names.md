# Place names

How Uplink names a place (where the car parked, where a trip began or ended, where a charge happened), and the rules the outside services set. Checked on 26 Oct 2026.

## Name order

One order everywhere, in `chargeName` and `spotName` (`lib/charge-names.ts`):

1. **Your tag**: the owner's own name for the spot, from `user_places`, matched within its radius (75 m). Always first.
2. **Station**: the station check's OpenStreetMap match for a charge, or a mapped charging station within 150 m of a parked spot (`lib/station-data.ts`).
3. **Invoice**: the attached invoice's network and station.
4. **Supercharger**: Tesla's site name.
5. **Area**: the OpenStreetMap area name kept in `place_names` (Nominatim reverse, looked up once per spot).

The car's own Home, Work and Favourite flags aren't names. They sit beside the name as a small tag: "Koramangala, Bengaluru · Home", or stand alone when nothing else names the spot.

Where the name is only the area, or there is none, the page offers **Name this place**. A tagged place offers a rename (the pencil). Both open the same sheet. It is on the Places table on Driving, a trip's start and end, the day page's charges, a charge's own page, and Settings > Your places. Parked stretches, the charging lists and the map pins show the names but have no sheet.

## Your places (`user_places`)

- Migration: `supabase/migrations/20261101140000_user_places.sql` (with `google_usage`, below). Service role only (RLS on, no policies, privileges revoked). Index on `(user_id, lat, lng)`.
- A tag is a name, a point and a radius. The name is always the owner's own: typed, or an OpenStreetMap suggestion they tapped. Nothing from Google is stored, so tags show everywhere, map pins included.
- Every read and write goes through `ownerDb` (`lib/server/user-places.ts`), so it is the signed-in user's rows only. The actions in `app/places/actions.ts` re-check the session and validate every input. The radius is set on the server.
- Before the migration runs, reads return no tags and saving says "Naming places isn't ready yet."
- Delete my data removes them (`eraseOwnerRows`). Deleting the account cascades.
- Matching is in memory: the owner's tags are read once per page (at most 500) and matched with `tagAt`.

## The naming sheet

A full-screen sheet over an opaque backdrop (`components/name-place.tsx`), so the page and its map are hidden while it is open. It has:

- **The name field**, empty for a new place. The owner types the name. It can be the same words they see in a hint, typed by them.
- **From OpenStreetMap**: mapped charging stations within 150 m and the kept area name. A tap fills the field (ODbL allows it), credited "© OpenStreetMap contributors".
- **Nearby on Google Maps** (with `GOOGLE_MAPS_API_KEY`): read-only hints, credited "Google Maps". Tapping does nothing, and no Google name or ID is ever sent back to the server.

Suggestions are asked for only when the sheet opens, for that one spot. Without the key there are no Google hints and no error. Demo mode uses made-up hints and calls nothing.

## Google

Each sheet open makes two calls, at most:

- **Places API (New) Nearby Search**, 150 m, ranked by distance, at most 8 results. Field mask `places.displayName,places.primaryType,places.types`. `displayName` puts it in Nearby Search Pro, the cheapest tier with a name. No ids (nothing is kept) and no Enterprise fields (ratings, hours, photos). Charging stations are listed first.
- **Geocoding API** reverse lookup, for the street address.

Each call that answers is counted in `google_usage` (UTC month, SKU: `nearbySearchPro`, `geocoding`) by `increment_google_usage`. Admin > Costs reads the month's counts (`googleUsage` in `lib/server/costs/usage.ts`) and prices them with `lib/costs.ts` `GOOGLE_SKUS`. Before the migration nothing is counted and the line reads "Not tracked yet".

### What the terms say, and what Uplink does

Sources: [Maps Platform Terms](https://cloud.google.com/maps-platform/terms), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (sections 6 and 14), [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies).

| Rule | What Uplink does |
| --- | --- |
| No use of Places or Geocoding content with or near a non-Google map (Service terms 6.2, 14.2; Maps Platform Terms 3.2.3(e)). Uplink's maps are MapLibre with CARTO tiles. | Google hints appear only in the full-screen sheet, whose opaque backdrop hides the page and its map. No pin, chip or tooltip shows anything from Google. |
| No scraping: don't "copy and save business names, addresses" (3.2.3(a)(iii)). | The owner decided: they type the name. Google hints can't be tapped into the field, and nothing from Google is saved. |
| No caching except as allowed (place IDs indefinitely, lat/lng 30 days). | Nothing from Google is cached or stored, IDs included. The sheet asks again each time it opens. |
| Attribution: the Google Maps logo, or the text "Google Maps" where space is short. | "Google Maps" right under the hints. |

### Pricing (India billing, checked by the owner on 26 Oct 2026)

From [India pricing](https://developers.google.com/maps/billing-and-pricing/india):

| SKU | Free each month | Then |
| --- | --- | --- |
| Geocoding (Essentials) | 70,000 | $1.50 per 1,000 |
| Places Essentials | 70,000 | $1.50 per 1,000 |
| Places IDs-only variants | — | $0 |
| Places Pro (Nearby Search Pro, Text Search Pro, Place Details Pro) | 35,000 | — |
| Places Enterprise | 7,000 | — |

Expected calls for one car: each time the sheet opens, one Nearby Search Pro call and one Geocoding call. An owner names perhaps 10 to 20 places in the first month and a few a month after, with some reopening. Say 30 opens a month: 30 Nearby Search Pro calls and 30 Geocoding calls, far inside the free tiers. Even 25 users opening the sheet 100 times a month each would be 2,500 of each.

## OpenStreetMap

### Nominatim (area names, `lib/server/place-names.ts`)

[Usage policy](https://operations.osmfoundation.org/policies/nominatim/):

- At most 1 request a second, in total for the app. Uplink spaces its calls 1.1 s apart in each server instance and asks for at most 2 new names per page view. Serverless instances don't share the gate, but with so few new spots it stays far below the limit.
- A User-Agent that identifies the app. Uplink sends `Uplink/1.0 (+https://getuplink.in; <OSM_CONTACT>)`. Set `OSM_CONTACT` to an email or URL the operators can reach.
- Cache results. Each spot is looked up once and kept in `place_names` (rounded to about 100 m), a miss included.
- No bulk or systematic queries (grids, every POI in an area), and no autocomplete. Lookups are only for spots the car parked at, shown on a page.
- Be able to switch it off without a release: `OSM_LOOKUPS=off`.
- Attribution, ODbL: "© OpenStreetMap contributors" wherever its names show (the Driving footer, the charging lists' credit, the sheet).
- Don't send personal data. Only a point is sent, never who parked there.

### Overpass

Not called by the app. Charging stations come from a periodic extract (`scripts/osm-stations.ts` into `lib/station-data.ts`). The [public instance's guidance](https://wiki.openstreetmap.org/wiki/Overpass_API): under 10,000 queries and 1 GB a day, divided by 100 for regular automated use, no parallel scripts, back off 30 s on 429 or 406, an identifying User-Agent, and self-host or pay for commercial use. The extract script runs by hand, one query at a time.
