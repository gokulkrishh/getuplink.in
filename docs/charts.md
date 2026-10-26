# Charts

Notes for agents. Every chart in the app goes inside `ChartCard` (`components/chart-card.tsx`). The drive page (`app/stats/driving/[start]/page.tsx`) is the reference.

## ChartCard

```tsx
<ChartCard
  as="h3"                    // h2 when the chart is the section, h3 under a section's own h2
  title="Power"              // what is measured: sentence case, no unit
  description="How hard the car drew on the battery. Below zero is regen: energy going back into the battery as the car slows."
  unit="kW"                  // picks the unit's plain words for the caption, from lib/unit-words.ts
  terms={["grade"]}          // optional: other glossary terms to explain after the unit
  summary={<Figures figures={peaks} />} // optional: tiles or a headline value above the chart
  caption="Gaps are stops."  // optional footnote: source, gaps, cut-offs
  empty="No driving today"   // optional: a note in the chart's place, same height
>
  <DriveTrace label="Power" points={power} unit="kW" signed from={start} to={end} legs={legs} />
</ChartCard>
```

The card renders the title, the description, the summary, the chart and then the caption. The caption is your `caption` followed by the glossary words for `unit` and `terms`. It has no hooks, so server sections and client plots can both use it.

- **Unit**: the chart draws its unit once, above the y axis (`ChartFrame`, `DriveTrace`). Don't repeat it in the title. The `unit` prop only chooses the caption words. Don't call `unitNotes` yourself in a caption that goes through `ChartCard`, or the words will show twice.
- **No data**: on a page about one thing (a drive, a charge), don't render the card at all. Check `points.length >= 2` in the parent, because a parent can't tell that a child rendered nothing. On a period page (Day, Week, Month), pass `empty` so switching periods doesn't change the page's shape.
- **Panel**: the plot sits in `bg-muted dark:bg-card` (the lit panel in dark mode) and uses one data hue, `chart-accent`. Gridlines are dashed `border-border`. A zero line is solid `muted-foreground/40`.
- **Tooltip**: every chart has one, opened by hover and by tap, showing the time or label and the value with its unit. A tap outside closes it. Where there's no reading near the pointer it says "No reading here". It must never show a far-off value.
- **Width**: a chart never scrolls sideways. Draw text in HTML, not inside a scaled SVG `viewBox`, so it stays 12px on a 390px phone. `DriveTrace` shows the pattern: HTML axes, and an SVG with `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"` that draws only the line.
- **X axis**: the axis covers only the data's own span, such as the drive's start to its end, and never pads out to a later reading. Charts stacked on one page share `from` and `to` so their axes line up. Clock labels are measured to fit, with none colliding.
- **Gaps**: break the line wherever there are no readings (stops between legs) rather than drawing a straight line across.

## Title

A noun for what is measured, in sentence case, with no unit and no period.

| Good | Bad |
| --- | --- |
| Speed | Speed (km/h) |
| Road grade | ROAD GRADE |
| Energy added | Energy Added Per Session |
| Battery level | Battery % over time |

## Description

One or two plain sentences saying what the chart shows and how to read it: what's up, what's down, and what zero means. Name the unit in words when it's obvious ("in km/h"). Leave the explanation of a non-obvious unit to the glossary caption.

| Good | Bad |
| --- | --- |
| How fast the car went through the drive, in km/h. | Vehicle speed telemetry. |
| How hard the car drew on the battery. Below zero is regen: energy going back into the battery as the car slows. | Power (kW), negative = regen |
| How steep the road was, as the car estimated it. Above zero is uphill, below zero is downhill. | Grade % → uphill/downhill |
| Kilometres driven each day, last 30 days. | Daily km – last 30d |

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
| Battery level, shares | Whole: "66%", "58% to 51%" | `formatPercent`, `formatLevels` | Whole percent, as the car's screen shows it |
| Rates of %: drain | 1 decimal: "1.4% a day" | `formatPercent(v, 1)` | Small numbers |
| Speed | Whole: "92 km/h" | `formatSpeed` | |
| Wh/km | Whole: "152 Wh/km" | `formatWhPerKm` (`lib/seasons.ts`) | |
| km per kWh | 1 decimal | `formatNumber(v, DECIMALS.kmPerKwh)` | |
| Temperature | Up to 1 decimal: "35.5 °C", "30 °C" | `formatCelsius`, `formatTempRange` | Reported in half degrees, never summed |

Figures with a fixed precision keep their trailing zero ("100.0 km"), so a total and its parts read alike. Exactly zero reads "0".

### Totals and their parts

A total and its parts agree as shown, to the last digit:

- Keep every figure at full precision in the data (`lib/driving-figures.ts`, `dailyDistance`, `groupTrips`, the MCP JSON in `lib/server/mcp-data.ts`). Round only to show it.
- Round the parts and the total together with `shownTotal(values, decimals)` (or `apportion`). It uses the largest remainder: the total is the parts' raw sum rounded once, and each part moves at most one last digit from its own rounding so that they add up to it. Three days of 46.215, 7.416 and 46.377 km show as 46.2, 7.4 and 46.4, and the week as 100.0 km. Rounded alone, they read 46, 7 and 46 against 100.
- Use the parts' sum as the headline, not a figure worked out apart. The bars share their edges, so the odometer's rise over a period is the same sum (`knownBars` in `driving-sections.tsx` builds both).
- A stacked bar rounds twice: the columns to the headline, then each column's segments to its column (`apportion(values, decimals, total)`).
- Use the same source for both. The Distance bars, Driving per day and the monthly table all read the odometer, merging the stream with the online polls by taking whichever was read later at each midnight: the later reading is closer to the boundary, so it puts each kilometre in the right day. The drives (`groupTrips`) are only the source for lists of trips and their own totals.
- Rows under a total (trips, legs, charges, sessions) take their figures from the same `shownTotal`: `shownTrip`, `shownTrips`, `SessionRow`'s `shownKwh`.
- A bar's tooltip shows its `display`, the rounded part, so the tip, the label and the headline agree.

## Units and the glossary

Every unit or term a non-technical owner might not know gets a short plain explanation wherever it appears: a chart, a tile or a table. The words live in one place, `lib/unit-words.ts` (`UNIT_WORDS`, `unitWords(unit)`, `unitNotes([units])`). Charts get them through `ChartCard`'s `unit` and `terms`. Tiles and tables use `unitWords` or `unitNotes` in a tile `note` or in one line under the tiles, as the drive page does for kWh. Add new terms to the glossary rather than writing the words inline.

Obvious units are never explained: km, km/h, %, °C, ₹ and min.

Current entries:

| Key | Says |
| --- | --- |
| kWh | energy, the same unit as on an electricity bill |
| kW | power, how fast energy flows at a moment |
| km/h per second | how much speed the car gained or lost in one second |
| m/s² | how quickly the car sped up or slowed down: 1 m/s² is 3.6 km/h each second |
| Wh/km | energy for each kilometre, in watt-hours (1,000 Wh is 1 kWh); lower is more efficient |
| ₹/kWh | the price of one kWh, like a unit on an electricity bill |
| % a day | how much battery the car lost each day while parked |
| psi | tyre pressure |
| grade | how steep the road is: 5% rises 5 metres for every 100 metres driven |
| regen | the motor slowing the car and sending energy back into the battery |
| V | the push behind the electricity; a home socket gives about 230 V |
| A | how much current flowed; more amps at the same volts charges faster |
| AC | slower charging from a wall charger or socket, through the car's own charger |
| DC | fast charging, like a Supercharger, where the station feeds the battery directly |

Where you can, prefer a unit people already understand. The drive page shows acceleration as km/h per second (the car's m/s² × 3.6) instead of m/s². Its tiles say "8.8 km/h" with the note "Gained in one second, at 8:27 AM", because the full unit doesn't fit a phone tile.

## Building blocks

- `ChartCard`, in `components/chart-card.tsx`: the wrapper.
- `DriveTrace`, in `components/stats/drive-lanes.tsx` (the file kept its old name): a single-series line over a time span. It has HTML axes, breaks at gaps and shows a tooltip.
- `Bars`, `ChartFrame`, `Captioned` and `EmptyChart`, in `components/stats/bars.tsx`: bar charts.
- `LineChart`, in `components/stats/line-chart.tsx`: lines over a 600-wide `viewBox`, so its 11px text renders at about 7px on a 390px phone. Move its axes to HTML following the `DriveTrace` pattern.
- The glossary: `lib/unit-words.ts`.

## Charts that move to ChartCard in phase 2

| File | Chart | What it shows |
| --- | --- | --- |
| `components/stats/driving-sections.tsx` | Distance | Bars: km per slot of the period |
| `components/stats/driving-sections.tsx` | Energy use and regen | Bars: kWh used per slot, then kWh won back by regen |
| `components/stats/driving-sections.tsx` | Driving per day | Bars: km per day, last 90 days |
| `components/stats/driving-extras.tsx` | Time at each speed | Bars: time spent in each speed band |
| `components/stats/driving-extras.tsx` | Efficiency | Wh/km figures |
| `components/stats/driving-extras.tsx` | Places | Map of everywhere the car went |
| `components/stats/season-efficiency.tsx` | Efficiency by season | Tiles: Wh/km per Indian season |
| `components/stats/day-timeline.tsx` | Timeline (Driving page, day page) | Strips of driving, parked and charging by time of day |
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
| `components/stats/battery-pack.tsx` + `battery-trend*.tsx` | Usable capacity by week | Recharts: kWh a full pack holds, by week |
| `components/stats/battery-extras.tsx` | Temperatures | `LineChart`: battery, inside and outside °C |
| `components/stats/battery-extras.tsx` | Cell balance | `LineChart`: spread between cells |
| `components/stats/battery-extras.tsx` | Capacity by distance | `LineChart`: full-pack kWh against odometer km |
| `components/stats/battery-extras.tsx` | Full pack by week, per Tesla | `LineChart`: Tesla's full-pack kWh by week |
| `components/stats/battery-health.tsx` | Battery health | Tiles: capacity, range at 100%, cycles, charging efficiency |
| `components/stats/parked-drain.tsx` | Parked drain | Headline and rows: % a day and W lost while parked |
| `components/stats/awake-timeline.tsx` + `awake-strip.tsx` | Online and asleep (Updates page) | Strips of awake and asleep runs per day |
| `components/home/sections.tsx` | Home sections | Bars: spend and distance per slot |
| `components/home/sparkline.tsx` | Headline sparklines (home) | Small bars or line behind each headline number |
| `components/version-chart.tsx` + `version-chart-plot.tsx` | Version history (Updates page, preview) | Recharts step line of software versions |
| `components/rollout-adoption.tsx` | Rollout adoption | Bars: cars on each version |
| `components/rollout-map.tsx` | Rollout map | India's states shaded by cars on a version |

Maps, timelines and tile-only sections still take the same title and description. Tiles explain their units through the glossary.
