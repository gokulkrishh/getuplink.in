# Charts

Notes for agents. Every chart in the app goes inside `ChartCard` (`components/chart-card.tsx`). The drive page (`app/stats/driving/[start]/page.tsx`) is the reference.

## ChartCard

```tsx
<ChartCard
  as="h3"                    // h2 when the chart is the section, h3 under a section's own h2
  title="Power"              // what is measured: sentence case, no unit
  description="Power drawn from the battery. Below zero is regen." // one short sentence
  info="Energy here is worked out from the car's power figures." // optional: a note the page doesn't say
  summary={<Figures figures={peaks} />} // optional: tiles or a headline value above the chart
  caption="Readings go back to 25 Sept" // optional: one short caveat line, never the period
  empty="No driving today"   // optional: a note in the chart's place, same height
>
  <DriveTrace label="Power" points={power} unit="kW" signed from={start} to={end} legs={legs} />
</ChartCard>
```

The card renders the title with an ⓘ beside it, the description, the summary, the chart and then the caption. A download button sits at the card's top right, or in the opened part of a `fold` row (`ChartDownload`, `components/chart-download.tsx`). It saves the chart itself as a PNG, without the title, summary or caption, in the page's theme, with "getuplink.in" under it. The chart is the card's `[data-chart-plot]` part; a chart drawn outside `ChartCard` (the rollout map) marks its own. Words only the image needs, like the map's version, carry `data-capture-only`: hidden on the page, shown in the image. Maps of places (Places, Charging map, a drive's route) have no button. A chart scrolled sideways saves the part on screen. The button is left out when the card shows `empty`, and with `download={false}` (the sample chart on the public home page). The image library loads on the first tap. The period is named once, at the top (see "Name the period once" below). The ⓘ shows only when `info` is given. The card has no hooks, so server sections and client plots can both use it (the ⓘ is its own client component).

- **Unit**: the chart draws its unit once, above the y axis (`ChartFrame`, `DriveTrace`). Don't repeat it in the title or the description. The `unit` prop only picks the popover words. See "Units on every axis and value" below.
- **No data**: on a page about one thing (a drive, a charge), don't render the card at all. Check `points.length >= 2` in the parent, because a parent can't tell that a child rendered nothing. On a period page (Day, Week, Month), pass `empty` so switching periods doesn't change the page's shape.
- **Panel**: the plot sits in `bg-muted dark:bg-card` (the lit panel in dark mode) and uses one data hue, `chart-accent`. Charging is one exception: charge pins on every map, their legend swatch, the charging bands on the charge level chart and the charging stretches on the day timeline use `charge` (green, `--charge` in `app/globals.css`). The drive page's signed traces are the other (see "Colour by meaning"). Routes and every other mark stay `chart-accent`. Gridlines are dashed `border-border`. A zero line is solid `muted-foreground/40`.
- **Charging bands**: wherever charging is shaded behind a line, a legend under the chart names both marks ("Battery level", "Charging", `ChargeLegend`), each band is at least 3px wide at `charge` 40%, and hovering or tapping one names it: "Charging · 25 Oct, 9:25 PM to 9:55 PM · 46% to 70%" (`chargeTip`). The line keeps its own tooltip elsewhere.
- **Zero bars**: a bar is drawn only when its figure shows a non-zero digit at its unit's precision (`showsZero` in `lib/format.ts`). 0.04 km reads "0.0" and draws nothing, never a sliver over "0.0". The same holds for stacked segments and sparkline bars.
- **Tooltip**: every chart has one, opened by hover and by tap, and on a line chart from the keyboard too (the plot takes focus; Left and Right step through the readings, Home and End jump to the ends, Esc or leaving hides it; `plotKeys` in `components/stats/plot-keys.ts`), showing the time or label and the value with its unit. A tap outside closes it. Where there's no reading near the pointer it says "No reading here". It must never show a far-off value.
- **Width**: a line chart never scrolls sideways. A bar chart keeps every column at least `MIN_COLUMN_PX` wide; one with more columns than fit (90 days on a phone) scrolls sideways in `ScrollEnd`, opening on its newest end, with the y axis staying put (the owner asked for this over squeezed slivers). `fit` on `BarColumns` opts a chart out. `ScrollEnd` only scrolls when the columns are wider than the panel, so a chart's hidden tips never add a sliver of scroll. Draw text in HTML, not inside a scaled SVG `viewBox`, so it stays 12px on a 390px phone. `DriveTrace` shows the pattern: HTML axes, and an SVG with `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"` that draws only the line.
- **Table width**: a data table fits the page column from sm up and never scrolls sideways there: narrow its columns or let text wrap or truncate rather than drop a column. On a phone it keeps every column and scrolls sideways in its `TableBox` (PR #69), so its minimum width is phone-only (`max-sm:min-w-[44rem]`). Put the figures an owner looks for first in the columns a phone shows before scrolling (a trip's distance and time sit right after When). A table and its skeleton share one column list (`lib/table-frame.ts`), so they keep the same shape.
- **X axis**: the axis covers only the data's own span, such as the drive's start to its end, and never pads out to a later reading. Charts stacked on one page share `from` and `to` so their axes line up. Clock labels are measured to fit, with none colliding.
- **Touch**: on a phone a tap opens a chart's tooltip and a tap elsewhere closes it. Charts carry `chart-touch` (no text selection or copy menu where nothing can hover); a line chart's SVG is `touch-pan-y`, so a vertical swipe still scrolls the page. Hover styles are `group-hover`, which Tailwind applies only where something can hover, so a bar's tip also opens from `TapColumns`. Strips, timelines and the heatmap use `FloatTip` with `useActiveMark` (`components/stats/float-tip.tsx`).
- **Hidden periods**: every period's chart is laid out in one cell (`ByPeriod` with `steady`), the ones not picked `invisible`. Never set `visibility: visible` on anything inside a chart: a visible child shows through a hidden parent, and every period's labels drew on top of each other. Toggle the element's own `invisible` class instead, as `useAxisLabels` does.
- **Gaps**: break the line wherever there are no readings (stops between legs) rather than drawing a straight line across.
- **The period a page opens on**: Home and the Driving and Battery pages open on Week, Charging on Month (most owners charge a few times a week, so a week holds one or two charges), Updates on Month. Each page declares it once in `PAGE_PERIODS` (`components/stats/periods.ts`), and that period stays out of the page's URL. A link that names another period, such as `/stats/charging?period=week`, still opens on it.
- **Buckets**: each period uses the finest bar its data supports. Day is 24 hourly bars, and a custom range of 2 days or less is 24 or 48. Week is 7 days and Month is the days of this month, with days still to come blank. Year is 12 months and All is years. Longer ranges move up from days to months to years (`rangeSlots`). The charge heatmap keeps 3-hour blocks: 7 × 24 squares are about 13px on a phone, and with a few charges a month they would be nearly all empty.
- **Hourly bars**: a drive's distance and energy are split across the hours it ran through. The distance comes from the odometer's last reading before each hour boundary (`counter_values_at`, read in the same single request as the period's other boundaries). The energy is the drive's EnergyRemaining drop, shared out by that distance (`Drive.hourKm`, `driveEnergy`), so it matches the trip list. If the car sent nothing in an hour (no presence field, see `PRESENCE_FIELDS`), that hour is blank, because the car was asleep. If it was awake and parked, the hour is a real 0.
- **Totals**: the headline is the raw sum of the bars under it (see Precision). For a Year that starts before the 90-day drive window, recent bars take energy from the drives and older ones from the lifetime counter, so its energy total is the raw sum of those bars too.
- **Start where the data starts**: a chart's bars begin at the later of the period's start and the day its data begins: the first odometer reading for driving, the first session for charging (`fromTracking`, `fromSince`). Bars still run to the period's end, with those ahead of now blank. When the bars are cut short, the words say "since 23 Oct". A chart with 4 days of data draws 4 bars and is never padded to 30 or 90.
- **Blocks of hours**: a bar or square that covers hours (Day's hourly bars, a custom range of 2 days or less, the charge heatmap) says its whole span wherever it is named: "7 AM to 8 AM" in the tooltip and for screen readers (`formatHours`), never just its start, which reads as "at 7 AM". The axis writes the start hour on the block's start boundary under a tick (a slot's `axis` and `edge`, see `Slot`), like a clock axis, not centred under the bar. Labels thin to every 2, 3, 6, 12 or 24 hours, so midnight always shows.

## Colour by meaning

The owner's rule: the same colour for up and down says nothing. A signed trace on the drive page (`DriveTrace` with `split`) draws its two sides in two colours, each named by a legend under the chart and by the tooltip in words ("Regen 3.1 kW", "Uphill 2.0%"), never by colour alone. The tones live in `TONES` in `components/stats/drive-lanes.tsx`:

| Chart | Above zero | Below zero | Marks |
| --- | --- | --- | --- |
| Power | Drawing, `chart-accent` | Regen, `charge` (energy going into the battery, like charging) | |
| Acceleration | Speeding up, `chart-accent` | Braking, `chart-worse` (amber) | Hard moments, `destructive` dots |
| Road grade | Uphill, `chart-worse`, shaded to zero | Downhill, `chart-accent`, shaded to zero | |

Speed and Battery level stay a single `chart-accent` line. A flat drive (grade within ±1% throughout) draws no Road grade chart: its one line says "Flat all the way."

## Verdicts on the drive page

Every trace chart on the drive page opens with one sentence that judges the readings, built in `lib/drive-verdict.ts` and only from the data: Speed ("Top 62 km/h, mostly 30 to 45 km/h."), Power ("About 3.1 kWh drawn, 0.4 kWh won back by regen (13%)."), Acceleration ("Gentle: no hard starts or stops." or "2 hard brakes, at 9:59 PM and 10:03 PM."), Road grade ("Mostly flat." / "One climb at 10:03 PM, up to 5%.") and Battery level ("Used 1% over 3.7 km."). The page opens with "How this drive went": Wh/km against the owner's usual (the median of their other drives in the last 30 days, once there are 5) and smoothness (hard starts and stops, at or past 0.3 g, against the usual count a drive). With fewer than 5 other drives it states facts only. A climb or descent is a stretch at or beyond 2% for at least 30 s (short dips merged, and at least half its readings steep), so a noisy flat road reads "Mostly flat.", never "47 climbs"; one brake is one hard moment, however many readings it spans. The thresholds (`HARD_G`, `USUAL_DAYS`, `MIN_USUAL_DRIVES`, `FLAT_GRADE`, `CLIMB_GRADE`, `MIN_SLOPE_MS`) live in that one file.

Those sentences are the fallback. Once written, the same lines come from AI (`lib/drive-wording.ts`, `lib/server/drive-wording.ts`): `anthropic/claude-haiku-5.5` through OpenRouter, given only the figures `lib/drive-facts.ts` builds (formatted as shown, clock times, no places or identifiers). Each line is checked before it shows: style (no "!", arrows or dashes, sentence count), no "usual" without one, no talk about the input, and every number must be one the facts hold. A line that fails shows its code sentence. An AI line starts with a small sparkles mark (`AiLine` in `components/ai-line.tsx`, the ⓘ's popover with "Written by AI from this drive's figures."); a code sentence has none. Wording is written once per drive after the response (`after()`), stored in `drive_wording` keyed by a hash of the facts, and shows from the next view. The demo uses stand-in wording on about two drives in three (`lib/server/demo/wording.ts`).

## Units on every axis and value

Every axis and value carries its unit, unless it's a time axis (hours, days, months, clock times).

- **Y axis ticks**: never two alike. `lib/axis.ts` holds the rule for every hand-drawn chart (`LineChart`, `ChartFrame` under `Bars`, `DriveTrace`, the DC curve, the charge curve's kW): `LineChart` puts its three ticks a round step apart (1, 2, 2.5 or 5 times a power of ten), and `axisLabels` writes them with one decimal, or more only when two would read the same. Rounding to one decimal once wrote "64.1, 64.1, 64" over 64.0 to 64.1 kWh (`test/axis.test.ts`).
- **Y axis**: the unit sits once above it (`unit` on `Bars`, `ChartFrame`, `LineChart`, `DriveTrace`), or on every tick when the unit is a sign before the number ("₹500"). A second y axis titles its own side (the charge curve's "%").
- **X axis that isn't time**: say what it is. Category bands are labelled on their boundaries under ticks, like a histogram ("0", "20" … "100+"), with the unit titled in the y gutter's bottom corner (`xUnit="km/h"` on `Bars`), so the first bar reads as 0 to 20. A numeric axis writes the unit on its ticks ("20%", "3,434.7 km").
- **Values above bars**: they carry their unit ("25%", "46.2 km", "₹243.52", "6.1 kWh") when every column's fits. Where they don't (six columns of "17.0 km" on a phone), they fall back to bare numbers under the axis's unit, then to none. `useValueLabels` measures this in the browser. Charts with more than 6 columns show no values above their bars.
- **Tooltips** always give the value with its unit, and the whole band or span it covers: "40 to 60 km/h", then "20% of driving time" (`valueWords` on `Bars` says what a share is of).
- **Shade**: a heatmap or a shaded map has a legend that says what the shade counts ("1 charge" to "6 charges", with an empty square for none).

## Title

A noun for what is measured, in sentence case, with no unit and no period.

| Good | Bad |
| --- | --- |
| Speed | Speed (km/h) |
| Road grade | ROAD GRADE |
| Energy added | Energy Added Per Session |
| Battery level | Battery % over time |

## Name the period once

The owner's rule: every chart and section names its period exactly once, at the top, and never again under the chart.

- **Where**: in the headline sentence when the chart has one ("Added in the last 7 days, 3.1 kWh more than the 7 days before"); otherwise in the summary line ("Most often Sun, 9 PM to 12 AM, 1 charge in the last 7 days") or the description, after a comma ("Battery level, last 7 days.", with `periodPhrase(frame)` from `components/stats/chart-caption.ts`, so All reads "all time", not "in total").
- **The caption under a chart** is only for what the top doesn't say: a caveat ("Readings go back to 25 Sept", "Days cover only the last 30 days", "Covers only 27 Sept to 26 Oct", "Latest 10 charges, newest first", "A line needs two weeks"), or the bars' span when it differs from the period (All draws whole years: "Each year, 2021 to 2026", `barsSpan`). Never "Last 7 days", "This month" or "Each day in the last 7 days" again under a headline that says it.
- **Empty**: when `empty` or a note stands in the chart's place, that sentence names the period ("No readings this month."), so the description drops it, and the period is still said once.
- **Tiles** under a headline don't repeat its period ("130.6 km driven", not "130.6 km driven in the last 7 days"). Tiles that mix spans (Battery health's "now" and the period's) say which each is.
- `test/period-once.test.ts` fails when a `caption=` names the frame's title or words, or when `barsSpan` repeats a period.

| Good | Bad |
| --- | --- |
| Added in the last 7 days. *(chart)* | Added in the last 7 days. *(chart)* Each day in the last 7 days, since 25 Oct |
| Battery level, this month. *(chart)* Readings go back to 25 Sept | Battery level over time. *(chart)* This month, since 25 Sept |
| …, 1 charge in the last 7 days. *(grid)* | …, 1 charge *(grid)* Last 7 days |

## Keep it brief

The owner's rule, for every page: too much text is worse than too little. Keep the meaning, cut the words, and never remove data.

1. **Description**: one short sentence, ideally under about 12 words, saying what the chart shows. Not how to read the axes, and no "hover or tap".
2. **The ⓘ is rare.** Use one only for a note the page can't say itself and an owner needs: which of two figures to trust, when to act. One or two short sentences (test/info-length.test.ts). Units aren't explained; owners know kWh, kW and km/h from the car.
3. **Caption**: at most one short line, only for what the top doesn't say (see "Name the period once"), with no trailing period. Drop sentences that repeat the title or description.
4. **Advice** (like "Sentry Mode keeps the car awake"): keep it only when it's actionable and fits on one short line. Otherwise move it into the popover.
5. **Tables**: short column headers. Explanations of columns ("Seen awake is a minimum", "≥ means parked since before the first reading") go in the popover.
6. **No interaction hints**, anywhere: no "Hover or tap for its value", "Tap a pin", "Click…", not even in the popover. People know how to hover. Screen-reader text and `aria-label`s are fine. A map footer keeps only its attribution.

| Good | Bad |
| --- | --- |
| How fast the car went. | How fast the car went through the drive, in km/h. |
| Power drawn from the battery. Below zero is regen. | How hard the car drew on the battery. Below zero is regen: energy going back into the battery as the car slows. |
| Uphill above zero, downhill below. | Grade % → uphill/downhill |
| Battery lost while parked. Lower is better. | How much battery the car lost while parked, as % a day, and the power it drew to stay on, in W. Lower is better. |

Copy rules: plain sentences, sentence case, no arrows, no en-dash ranges ("58% to 51%", "8:18 AM to 8:48 AM"). Show only what is known: no guessed times or durations, and no projections presented as readings.

## Precision

Every figure shows the precision its data supports, the same everywhere it appears. The rules live in one place, `lib/format.ts` (`DECIMALS` and the `format*` helpers). Never write `toFixed`, `Math.round` or a new `Intl.NumberFormat` for a figure on a page; use the helper for its unit.

| Unit | Shown | Helper | Why |
| --- | --- | --- | --- |
| Distance driven | 1 decimal: "46.2 km" | `formatKm` | The odometer reads to a few metres. Whole km lost up to 0.5 km a bar |
| Odometer | 1 decimal: "3,434.7 km" | `formatKm` | The same reading |
| Range (the car's estimate) | Whole: "287 km" | `formatRangeKm` | An estimate; tenths would be false precision |
| Energy | 1 decimal: "11.1 kWh" | `formatKwh` | Counters and bills read to 0.001 kWh |
| Power | 1 decimal: "7.2 kW"; under 1 kW in W: "24 W", "4.5 W" | `formatKw`, `formatPower` | |
| Money | To the paisa: "₹874.50" | `formatMoney` | Bills are to the paisa. Axis ticks stay compact |
| Tesla API cost | To the cent, in dollars: "$3.12" | `formatUsd` | Tesla bills in dollars; no exchange rate is known, so no rupees |
| Requests, signals | Whole: "1,23,456" | `formatCount` | |
| Battery level, shares | Whole: "66%", "58% to 51%" | `formatPercent`, `formatLevels` | Whole percent, as the car's screen shows it |
| Rates of %: drain | 1 decimal: "1.4% a day" | `formatPercent(v, 1)` | Small numbers |
| Speed | Whole: "92 km/h" | `formatSpeed` | |
| Wh/km | Whole: "152 Wh/km" | `formatWhPerKm` (`lib/seasons.ts`) | |
| km per kWh | 1 decimal | `formatNumber(v, DECIMALS.kmPerKwh)` | |
| Temperature | Up to 1 decimal: "35.5 °C", "30 °C" | `formatCelsius`, `formatTempRange` | Reported in half degrees, never summed |

A unit with decimals always shows all of them, the trailing zero included: "46.0 km", never "46 km" in one place and "46.0 km" in another. Zero reads "0.0 km" and "0.0 kWh" too. Only the whole-number units (%, km/h, Wh/km, range) show no decimals.

### One quantity, one reading

The same number always shows the same digits: on its bar, in the bar's tooltip, in a trip row, on the day page and in the monthly table. Each figure is rounded on its own by its unit's helper, and nothing is nudged to make a sum come out even.

- Keep every figure at full precision in the data (`lib/driving-figures.ts`, `dailyDistance`, `groupTrips`, the MCP JSON in `lib/server/mcp-data.ts`). Round only to show it.
- A total and its parts come from the same values: the headline is the raw sum of the bars or rows under it (`sumKnown`, or `knownBars` in `driving-sections.tsx`, which builds both), never a figure worked out apart. The bars share their edges, so the odometer's rise over a period is the same sum.
- Shown parts can then add up to a last digit off the shown total. Three days of 46.215, 7.416 and 46.377 km read 46.2, 7.4 and 46.4 against 100.0 km, but 0.35 + 0.35 + 0.35 reads 0.4 + 0.4 + 0.4 against 1.1. Both are the honest values, so leave them; never change a part's digits to match the total.
- Use one source for one quantity. The Distance bars, Driving per day and the monthly table all read the odometer, merging the stream with the online polls by taking whichever was read later at each midnight: the later reading is closer to the boundary, so it puts each kilometre on the right day. Trips, legs and drive stats come from the drives the stream shows, so a day's trips can come to up to about 0.1 km less than its odometer bar. Both are shown as read, with no note.
- A bar's tooltip shows its `display`, so the tip and the label read the same digits.

## The info popover

`InfoButton` (`components/info-button.tsx`) is a small ⓘ that opens a popover with one or two sentences. Hover or keyboard focus opens it on a desktop, a tap on a phone; a tap outside or Esc closes it. It renders nothing without children.

```tsx
<InfoButton label="Power">Energy here is worked out from the car's power figures.</InfoButton>
```

- `label` names what it's about; the button's accessible name is "About {label}".
- **Charts**: `ChartCard` draws it beside the title from `info`. **Tiles**: `Figures` takes `info` and `label`.
- A symbol on screen that needs words (like "≥") gets a footnote under the list, shown only when the symbol is.


## Building blocks

- `ChartCard`, in `components/chart-card.tsx`: the wrapper.
- `DriveTrace`, in `components/stats/drive-lanes.tsx` (the file kept its old name): a single-series line over a time span. It has HTML axes, breaks at gaps and shows a tooltip.
- `Bars`, `ChartFrame`, `Captioned` and `EmptyChart`, in `components/stats/bars.tsx`: bar charts.
- `LineChart`, in `components/stats/line-chart.tsx`: lines over a 600-wide `viewBox`, so its 11px text renders at about 7px on a 390px phone. Move its axes to HTML following the `DriveTrace` pattern.

## Charts that move to ChartCard in phase 2

| File | Chart | What it shows |
| --- | --- | --- |
| `components/stats/driving-sections.tsx` | Distance | Bars: km per slot of the period; each tip adds the bar's kWh and Wh/km, and the caption sums the period's kWh, regen and Wh/km |
| `components/stats/driving-sections.tsx` | Driving per day | Bars: km per day, last 90 days |
| `components/stats/driving-extras.tsx` | Time at each speed | Bars: time spent in each speed band |
| `components/stats/driving-extras.tsx` | Efficiency | Wh/km figures |
| `components/stats/driving-extras.tsx` | Places | Map of everywhere the car went |
| `components/stats/season-efficiency.tsx` | Efficiency by season | Tiles: Wh/km per Indian season |
| `components/stats/day-timeline.tsx` | Timeline (Driving page) | Strips of driving, parked and charging by time of day |
| `components/stats/trip-timeline.tsx` | Timeline (drive page) | Legs and stops of a trip |
| `components/stats/trip-map.tsx` | Map (drive page, day page) | Route with start, stops and end |
| `components/stats/charging-sections.tsx` | Spend | Bars: Supercharger bill per slot |
| `components/stats/charging-sections.tsx` | Energy added | Stacked bars (`stacked-bars.tsx`): kWh added per slot, by charger type |
| `components/stats/charging-extras.tsx` | DC charging speed | `LineChart`: kW against battery % |
| `components/stats/charging-extras.tsx` | Charging map | Where charges happened |
| `components/stats/charge-habits.tsx` | When you charge | Heatmap of charge starts by weekday and hour |
| `components/stats/charge-range.tsx` | Charge range | Bars across 0 to 100%: where charges start and stop |
| `components/stats/charge-level.tsx` + `charge-level-plot.tsx` | Charge level | Recharts: battery % over the span, charging shaded (Battery page and home) |
| `components/stats/charge-curve.tsx` + `charge-curve-plot.tsx` | Charge curve (charge detail page) | Recharts: kW and battery % through one charge |
| `components/stats/charge-supply.tsx` | Charger | Tiles: volts, amps, phases, cable (explain V and A) |
| `components/stats/battery-pack.tsx` + `battery-trend-plot.tsx` | Battery health over time | `LineChart`: usable capacity by week, with Tesla's own full-pack figure as a second line ("Tesla's figure") when it has two weeks; the legend and tooltip name both |
| `components/stats/battery-extras.tsx` | Temperatures (under More detail) | `LineChart`: battery, inside and outside °C |
| `components/stats/battery-extras.tsx` | Cell balance (under More detail) | `LineChart`: spread between cells |
| `components/stats/battery-health.tsx` | Battery health | Tiles: capacity, range at 100%, cycles, charging efficiency |
| `components/stats/parked-drain.tsx` | Parked drain | Headline and rows: % a day and W lost while parked |
| `components/stats/awake-timeline.tsx` + `awake-strip.tsx` | Awake and asleep (Battery page, after Parked drain) | Strips of awake and asleep runs per day |
| `components/home/sections.tsx` | Home sections | Bars: spend and distance per slot |
| `components/home/sparkline.tsx` | Headline sparklines (home) | Small bars or line behind each headline number |
| `components/version-chart.tsx` + `version-chart-plot.tsx` | Version history (Updates page, preview) | Recharts step line of software versions |
| `components/rollout-adoption.tsx` | Rollout adoption | Bars: cars on each version |
| `components/rollout-map.tsx` | Rollout map | India's states shaded by cars on a version |

Maps, timelines and tile-only sections still take the same short title and description.
