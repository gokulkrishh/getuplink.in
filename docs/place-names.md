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

- Migration: `supabase/migrations/20261101120000_user_places.sql`. Service role only (RLS on, no policies, privileges revoked). Index on `(user_id, lat, lng)`.
- Every read and write goes through `ownerDb` (`lib/server/user-places.ts`), so it is the signed-in user's rows only. The actions in `app/places/actions.ts` re-check the session and validate every input. The radius is set on the server.
- Before the migration runs, reads return no tags and saving says "Naming places isn't ready yet."
- Delete my data removes them (`eraseOwnerRows`). Deleting the account cascades.
- Matching is in memory: the owner's tags are read once per page (at most 500) and matched with `tagAt`.

## Google (suggestions in the sheet)

The sheet asks for suggestions only when it opens, for that one spot. With `GOOGLE_MAPS_API_KEY` set it makes two calls:

- **Places API (New) Nearby Search**, 150 m, ranked by distance, at most 8 results. Field mask `places.id,places.displayName,places.primaryType,places.types`. `displayName` puts it in Nearby Search Pro, the cheapest tier with a name. No Enterprise fields (ratings, hours, photos). Charging stations are listed first.
- **Geocoding API** reverse lookup, for the street address.

Without the key the sheet shows OpenStreetMap's suggestions (nearby mapped stations, the kept area name) and the name field, with no error. Demo mode uses made-up suggestions and calls nothing.

### What the terms say, and what Uplink does

Sources: [Maps Platform Terms](https://cloud.google.com/maps-platform/terms), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (sections 6 and 14), [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies).

| Rule | What Uplink does |
| --- | --- |
| No use of Places or Geocoding content with a non-Google map (Service terms 6.2, 14.2). The main terms say not "with or near" one. Uplink's maps are MapLibre with CARTO tiles. | Google results appear only in the naming sheet. It always opens below its trigger, never flipped up over a map. No pin, chip or tooltip on a map ever shows a Google name (`SpotName.map`). **Still near a map: see open risks.** |
| No caching except as allowed. Place IDs may be kept indefinitely. Places and Geocoding lat/lng may be cached for 30 days. Geocoding addresses may be cached only per end user, for that user's own feature. | Nothing from Google is cached. A confirmed suggestion keeps only its `place_id` (`user_places.google_place_id`). The sheet calls Google again each time it opens. |
| Attribution: the Google Maps logo, or the text "Google Maps" where space is short. | The sheet shows "Google Maps" under the suggestions whenever one is Google's. |
| No scraping: don't "copy and save business names, addresses". | **Open risk, see below.** |

### Open risk: the sheet sits near our map

The sheet doesn't cover a map, but it shares the screen with one. On Driving it opens from the Places table just under the Places map. On a trip it opens from the From and To facts in the map's own card. The main terms forbid using Google content "with or near a non-Google Map", and it isn't clear whether a popover under a map counts as near. Options: open the sheet as a full-screen dialog on its own, or offer it only where no map shows (Settings, a charge's page, the day page's charge rows).

### Open risk: confirming a Google suggestion

The owner asked for a tapped suggestion to become their tag. Tapping one fills the name field, and saving stores that text in `user_places` as the owner's name, with the `place_id` beside it. The terms forbid copying and saving business names or addresses (Maps Platform Terms 3.2.3(a)(iii)). They allow user-confirmed data replacing Google content in the Address Validation API only, and say nothing like it for Places or Geocoding. So storing a name that came from Google, unchanged, may break the terms. It isn't clearly allowed as user-generated content.

What limits it now:

- It is one name per spot, saved only when the owner taps Save, kept for that owner only, and never shown on a map. A tag with a `google_place_id` stays off map pins and falls back to OpenStreetMap's name there.
- A name the owner edits, even slightly, is saved as their own (no `place_id`). Saved again unchanged, it stays Google's and keeps its `place_id`.
- There is no per-spot `place_id` cache: an ID alone shows nothing without a Place Details call, so it would only add cost. IDs are kept only on confirmed tags.

Safer options, for the owner to decide:

1. Store only the `place_id` for a Google-sourced tag, and fetch the name (Place Details, IDs and name) when the tag is shown. That costs a call per view, which the "no bulk lookups" rule rules out for lists.
2. Let Google suggestions only prefill the field, and require an edit before saving.
3. Drop Google suggestions and keep OpenStreetMap's (the sheet works without the key).

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
