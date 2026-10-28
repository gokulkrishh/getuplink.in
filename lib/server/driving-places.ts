import "server-only";
import { DRIVE_DAYS } from "@/lib/drives";
import { recentSpan, type Timeframe } from "@/lib/periods";
import { type DrivingExtras, INSIGHT_DAYS } from "./driving-extra";
import { withGoogleNames } from "./google-place-names";

const DAY = 86_400_000;

// The days of readings a period's insights cover: its newest ones, cut to the drives kept.
export const insightSpan = (frame: Timeframe, now: number) => recentSpan(frame.span, now - DRIVE_DAYS * DAY, INSIGHT_DAYS, now);

// How many places the table and the map show.
export const PLACES_SHOWN = 15;

// The insights with the table's places (the shown ones) given a Google-tagged place's live name; the map keeps `name`.
export const withGooglePlaces = (list: DrivingExtras[]) => Promise.all(list.map(async (x) => ({ ...x, places: await withGoogleNames(x.places.slice(0, PLACES_SHOWN)) })));
