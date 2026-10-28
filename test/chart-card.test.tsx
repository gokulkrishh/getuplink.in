import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartCard } from "@/components/chart-card";

// A chart's tips show on `group-hover` of their column. A bare `group` on a wrapper would open every tip
// in the chart whenever the wrapper is hovered, so wrappers use a named group.
test("a folded card's row isn't a bare group, so hovering it doesn't open the chart's tips", () => {
  const html = renderToStaticMarkup(
    <ChartCard fold title="Plug-in level" description="Half of owners plug in at 30% to 60%.">
      <div />
    </ChartCard>,
  );
  expect(html).toContain("group/fold");
  expect(html).not.toMatch(/class="group[ "]/);
});
