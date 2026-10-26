# Charts

Notes for agents. Every chart in the app goes inside `ChartCard` (`components/chart-card.tsx`). The drive page (`app/stats/driving/[start]/page.tsx`) is the reference.

## ChartCard

```tsx
<ChartCard
  as="h3"                    // h2 when the chart is the section, h3 under a section's own h2
  title="Power"              // what is measured: sentence case, no unit
  description="Power drawn from the battery. Below zero is regen." // one short sentence
  unit="kW"                  // its plain words go in the ⓘ popover, from lib/unit-words.ts
  terms={["regen"]}          // optional: other glossary terms for the popover
  info="Each point is the middle value of a 5% step." // optional method notes for the popover
  summary={<Figures figures={peaks} />} // optional: tiles or a headline value above the chart
  caption="Last 7 days"      // optional: at most one short line, only when needed
  empty="No driving today"   // optional: a note in the chart's place, same height
>
  <DriveTrace label="Power" points={power} unit="kW" signed from={start} to={end} legs={legs} />
</ChartCard>
```

The card renders the title with an ⓘ beside it, the description, the summary, the chart and then the caption. The ⓘ shows only when `unit`, `terms` or `info` has something to say. The card has no hooks, so server sections and client plots can both use it (the ⓘ is its own client component).

- **Unit**: the chart draws its unit once, above the y axis (`ChartFrame`, `DriveTrace`). Don't repeat it in the title or the description. The `unit` prop only picks the popover words.
- **No data**: on a page about one thing (a drive, a charge), don't render the card at all. Check `points.length >= 2` in the parent, because a parent can't tell that a child rendered nothing. On a period page (Day, Week, Month), pass `empty` so switching periods doesn't change the page's shape.
- **Panel**: the plot sits in `bg-muted dark:bg-card` (the lit panel in dark mode) and uses one data hue, `chart-accent`. Charging is the one exception: charge pins on every map, their legend swatch and the charging bands on the charge level chart use `charge` (green, `--charge` in `app/globals.css`). Routes and every other mark stay `chart-accent`. Gridlines are dashed `border-border`. A zero line is solid `muted-foreground/40`.
- **Tooltip**: every chart has one, opened by hover and by tap, showing the time or label and the value with its unit. A tap outside closes it. Where there's no reading near the pointer it says "No reading here". It must never show a far-off value.
- **Width**: a chart never scrolls sideways. Draw text in HTML, not inside a scaled SVG `viewBox`, so it stays 12px on a 390px phone. `DriveTrace` shows the pattern: HTML axes, and an SVG with `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"` that draws only the line.
- **X axis**: the axis covers only the data's own span, such as the drive's start to its end, and never pads out to a later reading. Charts stacked on one page share `from` and `to` so their axes line up. Clock labels are measured to fit, with none colliding.
- **Gaps**: break the line wherever there are no readings (stops between legs) rather than drawing a straight line across.
- **Blocks of hours**: a bar or square that covers hours (Day's 3-hour bars, a custom range of 2 days or less, the charge heatmap) says its whole span wherever it is named: "6 AM to 9 AM" in the tooltip and for screen readers (`formatHours`), never just its start, which reads as "at 6 AM". The caption says what each bar covers ("Kilometres driven in each 3-hour block today, 12 AM to 12 AM"). The axis writes the start hour on the block's start boundary under a tick (a slot's `axis` and `edge`, see `Slot`), like a clock axis, not centred under the bar.

## Title

A noun for what is measured, in sentence case, with no unit and no period.

| Good | Bad |
| --- | --- |
| Speed | Speed (km/h) |
| Road grade | ROAD GRADE |
| Energy added | Energy Added Per Session |
| Battery level | Battery % over time |

## Keep it brief

The owner's rule, for every page: too much text is worse than too little. Keep the meaning, cut the words, and never remove data.

1. **Description**: one short sentence, ideally under about 12 words, saying what the chart shows. Not how to read the axes, and no "hover or tap".
2. **Units and method go behind the ⓘ.** Glossary words and method notes (how a figure is worked out, what a mark, a gap or a symbol means) go in the info popover, never inline.
3. **Caption**: at most one short line, only when needed, such as the span ("Last 7 days", "Each day, last 7 days") or a data cut-off ("Readings go back to 25 Sept."). Drop sentences that repeat the title or description.
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

`InfoButton` (`components/info-button.tsx`) is a small ⓘ that opens a popover: method notes first, then the glossary words for each unit or term. Hover or keyboard focus opens it on a desktop, a tap on a phone; a tap outside or Esc closes it. It renders nothing when there's nothing to say.

```tsx
<InfoButton label="Parked drain" terms={["% a day", "W", "kWh"]}>
  <p>Seen awake counts only the time the car was sending data, so it's a minimum.</p>
</InfoButton>
```

- `label` names what it's about; the button's accessible name is "About {label}".
- `terms` are glossary keys from `lib/unit-words.ts`. Unknown or undefined keys are skipped.
- Children are the method notes: a string, or one `<p>` per note.

Where it goes:

- **Charts**: `ChartCard` draws it beside the title from `unit`, `terms` and `info`.
- **Tiles**: `Figures` takes `terms`, `info` and `label` and draws it in the grid's top-right corner. Tiles inside a `ChartCard` `summary` put their terms on the card instead, so a card has one ⓘ.
- **Anything else** (Parked drain, the charge session's tiles): put `InfoButton` beside the heading, in a `flex items-center gap-1.5` row.

## Units and the glossary

Every unit or term a non-technical owner might not know gets a short plain explanation in the ⓘ popover wherever it appears: a chart, a tile or a table. The words live in one place, `lib/unit-words.ts` (`UNIT_WORDS`, `unitWords(unit)`, `unitNotes([units])`, `hasWords([units])`). Pass keys as `terms`; don't write the words inline. Add new terms to the glossary rather than writing them in a component.

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

Maps, timelines and tile-only sections still take the same short title and description. Tiles explain their units through the ⓘ popover.
