# Place names

How Uplink names a place (where the car parked, where a trip began or ended, where a charge happened), and the rules the outside services set. Checked on 26 Oct 2026.

## Name order

One order everywhere, in `chargeName` and `spotName` (`lib/charge-names.ts`):

1. **Your tag**: the owner's own name for the spot, from `user_places`, matched within its radius (75 m). Always first. A tag is either a typed name or a Google place the owner picked (below).
2. **Station**: the station check's OpenStreetMap match for a charge, or a mapped charging station within 150 m of a parked spot (`lib/station-data.ts`).
3. **Invoice**: the attached invoice's network and station.
4. **Supercharger**: Tesla's site name.
5. **Area**: the OpenStreetMap area name kept in `place_names` (Nominatim reverse, looked up once per spot).

The car's own Home, Work and Favourite flags aren't names. They sit beside the name as a small tag: "Koramangala, Bengaluru · Home", or stand alone when nothing else names the spot.

### Two names per spot

`SpotName` carries two names, so Google content can't reach a map by accident:

- `name`: never Google's. A typed tag, or, for a Google tag, whatever comes next in the order above (usually the area). Map pins, their labels and tooltips, the trip map's facts card, charts, the MCP export and the curves' labels read only this, through `mapName`.
- `google`: a picked Google place's name, fetched live (`withGoogleNames`), or null. Only rows, lists, titles and the sheet read it (`shownName`), each with "Google Maps" beside it.

Where `google` shows: the Places table on Driving, the charging lists (home and Charging), the parked stretches on Battery, the day page's charges and a charge's own title. Where it never shows: any MapLibre/CARTO map, its pins and tooltips, the facts card under a trip's map (it is part of the map), chart labels, and the MCP export.

### The sheet's trigger

Any tagged spot (typed or Google) gets the pencil. A spot named only by its area, or by nothing, gets **Name this place**. Otherwise nothing (`nameAction`). Both open the same sheet. It is on the Places table on Driving, a trip's start and end, the day page's charges and a charge's own page. Parked stretches, the charging lists and the map pins show the names but have no sheet. Renaming and removing are done from the place itself; Settings has no list of places.

## Saved places (`user_places`)

- Migrations: `20261101140000_user_places.sql` (the table, with `google_usage`, below) and `20261103140000_user_places_google_id.sql` (`google_place_id`, `name` nullable, and a check that a row has exactly one of the two). Service role only (RLS on, no policies, privileges revoked). Index on `(user_id, lat, lng)`.
- A tag is a point, a radius, and a name: typed (or an OpenStreetMap suggestion the owner tapped), or a Google place ID. A typed name is the owner's own data and shows everywhere, map pins included.
- Every read and write goes through `ownerDb` (`lib/server/user-places.ts`), so it is the signed-in user's rows only. The actions in `app/places/actions.ts` re-check the session and validate every input (`parsePlaceId`: letters, digits, `_` and `-`, 10 to 1,000 characters). The radius is set on the server.
- Reads use `select("*")`, so they work before and after `google_place_id` exists.
- Before the first migration, reads return no tags and saving says "Naming places isn't ready yet." Before the second, typed names save as before, Google suggestions are shown but can't be tapped (`googleTapReady` checks for the column when the sheet opens), and saving a Google place says it isn't ready.
- Delete my data removes them (`eraseOwnerRows`). Deleting the account cascades.
- Matching is in memory: the owner's tags are read once per page (at most 500) and matched with `tagAt`.

## The naming sheet

A full-screen sheet over an opaque backdrop (`components/name-place.tsx`), so the page and its map are hidden while it is open. It has:

- **Now**, for a Google tag: its live name and "Google Maps".
- **The name field**, empty for a new place or a Google tag. The owner types the name.
- **From OpenStreetMap**: mapped charging stations within 150 m and the kept area name. A tap fills the field (ODbL allows it), credited "© OpenStreetMap contributors".
- **Nearby** (with `GOOGLE_MAPS_API_KEY`), in its own bordered box with "Google Maps" under it. A tap on a place selects it; Save sends only its place ID. Its name is never copied into the field and never sent back. Typing clears the selection. The street address from Geocoding has no place ID and stays read-only.

Suggestions are asked for only when the sheet opens, for that one spot. Without the key there are no Google suggestions and no error. Demo mode uses made-up suggestions and IDs (`DEMO_GOOGLE_NAMES`) and calls nothing; one demo tag is a Google place, near Whitefield.

## Google

### Calls

When the sheet opens, at most:

- **Places API (New) Nearby Search**, 150 m, ranked by distance, at most 8 results. Field mask `places.id,places.displayName,places.primaryType,places.types`. `displayName` puts it in Nearby Search Pro, the cheapest tier with a name; `id` is an IDs Only field and adds nothing. No Enterprise fields (ratings, hours, photos). Charging stations are listed first.
- **Geocoding API** reverse lookup, for the street address.
- **Place Details (New)**, for a Google tag's current name.

When a page shows a Google-tagged place in a row or title:

- **Place Details (New)**, `GET places/{id}`, field mask `displayName` only, `cache: "no-store"` (`lib/server/google-place-names.ts`). One call per place per render: React's `cache()` shares the answer within one render and nothing else holds it. At most 20 places a page; past that a row shows its safe name. The MCP export and the trip map's facts card never ask.

Each call that answers is counted in `google_usage` (UTC month, SKU: `nearbySearchPro`, `geocoding`, `placeDetailsPro`) by `increment_google_usage`. A failed call isn't counted. Admin > Costs reads the month's counts (`googleUsage` in `lib/server/costs/usage.ts`) and prices them with `lib/costs.ts` `GOOGLE_SKUS`. Before the first migration nothing is counted and the line reads "Not tracked yet".

Without the key, or when Google fails or times out (5 s), a Google-tagged place shows its next name, usually the OpenStreetMap area, with no credit.

### Which SKU the name lookup bills

From [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details): the IDs Only SKU covers `attributions`, `id`, `name` (the resource name, `places/PLACE_ID`), `photos` and moved-place fields, and says "To get the text name of the place, request the displayName field in the Pro SKU". Essentials covers address and location fields only. `displayName` is a Place Details Pro field, so Pro is the cheapest SKU that returns a name. Asking for `displayName` alone keeps it at Pro (no Enterprise fields).

### What the terms say, and what Uplink does

Sources, read on 26 Oct 2026:

- [Maps Platform Terms](https://cloud.google.com/maps-platform/terms) (last modified 26 Aug 2026): 3.2.3(a) No Scraping, 3.2.3(b) No Caching, 3.2.3(e) No Use With Non-Google Maps.
- [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (last modified 15 Oct 2026): section 14, Places API (Legacy and New); section 6, Geocoding API.
- [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies): caching exceptions and attribution.
- [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id): storing and refreshing IDs.

| Rule | What Uplink does |
| --- | --- |
| Place IDs may be stored: "the place ID, used to uniquely identify a place, is exempt from the caching restrictions. You can therefore store place ID values indefinitely." (Places policies, Exceptions from caching restrictions) | A tapped Google place is saved as its `google_place_id` only. |
| Nothing else may be stored or cached: "Content, except for place IDs, cannot be cached or stored unless permitted by agreement" (Places policies); "Customer will not cache Google Maps Content except as expressly permitted" (3.2.3(b)); only lat/lng may be cached, for 30 days (Service terms 14.3); don't "copy and save business names, addresses" (3.2.3(a)(iii)). | The name is fetched live each time with `no-store`. It is held only for one render (React `cache()`) and, through `"use cache: private"`, in the browser's memory for the page's 60-second `stale` time; production keeps no server copy (Next.js `use cache: private` docs). It is never written to the database, a shared cache (`"use cache"`, `"use cache: remote"`), a log, or the MCP export. The owner's typed name is never filled from Google. |
| No use with a non-Google map: "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map" (Service terms 14.2); "Customer will not use the Google Maps Core Services with or near a non-Google Map ... (i) display or use Places content on a non-Google Map" (3.2.3(e)); "Places API results must display on a Google Map, if a map is used" (Places policies). Uplink's maps are MapLibre with CARTO tiles. | Google names never reach a map: pins, labels and tooltips read `mapName`, which can't return one, and the facts card under a trip's map shows the area. Google suggestions appear only in the full-screen sheet, whose opaque backdrop hides the page and its map. Rows and titles that show a Google name sit apart from any map on the page. Tests: `test/charge-names.test.ts`, `test/google-names-guard.test.ts`. |
| Use without a map is allowed: "Customer may use Google Maps Content from the Places API in Customer Applications without a corresponding Google Map" (Service terms 14.1). | Rows, lists and titles. |
| Attribution: "When displaying Places API data without a Google Map, you must include the Google logo"; the text "Google Maps" is acceptable where space is limited, unmodified, on one line, untranslated (`translate="no"`), 12 to 16 px, weight 400, in #1F1F1F, #5E5E5E or white at 4.5:1 contrast, near the content and in the same container, and Google content visually distinct from other content (Places policies, Google Maps attribution). | `GoogleMapsCredit` (`components/google-maps-credit.tsx`): "Google Maps" at 12 px, #5E5E5E on the light theme and white on the dark one, right beside every Google name, never truncated. In the sheet, Google's suggestions sit in their own bordered box with the credit under them. |
| Refresh old IDs: place IDs can change; Google suggests refreshing those older than 12 months, and Place Details with the `id` field alone is free (Place IDs guide). | Not done yet. A stale ID returns NOT_FOUND, which shows the area like any other failure. The owner can pick the place again. |

### Pricing (India billing)

From [India pricing](https://developers.google.com/maps/billing-and-pricing/india), checked 26 Oct 2026:

| SKU | Free each month | Then, per 1,000 (first tier) |
| --- | --- | --- |
| Geocoding (Essentials) | 70,000 | $1.50 |
| Places Essentials | 70,000 | $1.50 |
| Places IDs Only variants | — | $0 |
| Nearby Search Pro | 35,000 | $9.60 |
| **Place Details Pro** (the name lookup) | 35,000 | **$5.10** |
| Places Enterprise | 7,000 | — |

Expected calls for one car:

- Sheet opens: one Nearby Search Pro and one Geocoding call each, plus one Place Details Pro for a Google tag. Say 30 opens a month.
- Live names: one Place Details Pro call per Google-tagged place per page view that shows it (the Places table, a charging list, parked stretches, a day, a charge). An owner with 5 Google places who opens those pages 10 times a day is about 5 × 10 × 30 = 1,500 calls a month, if every view shows all five. Coming back to a page within 60 seconds reuses the browser's copy.
- 20 such owners would be about 30,000 Place Details Pro calls a month, inside the 35,000 free. Past that, each 1,000 costs $5.10. Admin > Costs shows the month's count; Google's billing page is the source of truth.

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
