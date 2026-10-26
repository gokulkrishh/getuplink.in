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
- **Buckets**: each period uses the finest bar its data supports. Day is 24 hourly bars, and a custom range of 2 days or less is 24 or 48. Week is 7 days and Month is the days of this month, with days still to come blank. Year is 12 months and All is years. Longer ranges move up from days to months to years (`rangeSlots`). The charge heatmap keeps 3-hour blocks: 7 × 24 squares are about 13px on a phone, and with a few charges a month they would be nearly all empty.
- **Hourly bars**: a drive's distance and energy are split across the hours it ran through. The distance comes from the odometer's last reading before each hour boundary (`counter_values_at`, read in the same single request as the period's other boundaries). The energy is the drive's EnergyRemaining drop, shared out by that distance (`Drive.hourKm`, `driveEnergy`), so it matches the trip list. If the car sent nothing in an hour (no presence field, see `PRESENCE_FIELDS`), that hour is blank, because the car was asleep. If it was awake and parked, the hour is a real 0.
- **Bars add up**: bars are rounded the way they are shown (whole km, kWh to one decimal) by largest remainder (`roundToTotal`), so they add up to the total above the chart.
- **Start where the data starts**: a chart's bars begin at the later of the period's start and the day its data begins: the first odometer reading for driving, the first session for charging (`fromTracking`, `fromSince`). Bars still run to the period's end, with those ahead of now blank. When the bars are cut short, the words say "since 23 Oct". A chart with 4 days of data draws 4 bars and is never padded to 30 or 90.
- **Blocks of hours**: a bar or square that covers hours (Day's hourly bars, a custom range of 2 days or less, the charge heatmap) says its whole span wherever it is named: "7 AM to 8 AM" in the tooltip and for screen readers (`formatHours`), never just its start, which reads as "at 7 AM". The caption says what each bar covers ("Kilometres driven each hour today"). The axis writes the start hour on the block's start boundary under a tick (a slot's `axis` and `edge`, see `Slot`), like a clock axis, not centred under the bar. Labels thin to every 2, 3, 6, 12 or 24 hours, so midnight always shows.

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
