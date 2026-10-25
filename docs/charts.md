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

Where you can, prefer a unit people already understand. The drive page shows acceleration as km/h per second (the car's m/s² × 3.6) instead of m/s². Its tiles say "8.8 km/h" with the note "Gained in one second, at 8:27 AM", because the full unit doesn't fit a phone tile.

## Charts that move to ChartCard in phase 2

See the phase 1 report for the full list. They include the bar sections in `driving-sections.tsx`, `charging-sections.tsx`, `driving-extras.tsx`, `rollout-adoption.tsx` and `components/home/sections.tsx`; the `LineChart` users in `battery-extras.tsx` and `charging-extras.tsx`; and the custom plots (charge curve, charge level, battery trend, version chart, parked drain, charge habits, season efficiency, awake and day timelines).
