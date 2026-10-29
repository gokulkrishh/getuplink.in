import { describe, expect, test } from "bun:test";
import { energyCaption, energyLines } from "@/components/stats/driving-sections";
import type { DrivingFigure, DrivingPeriod } from "@/lib/driving-figures";

// The Distance chart's energy: the one line under the chart and each bar's tip lines.

const figure = (f: Partial<DrivingFigure> = {}): DrivingFigure => ({ km: null, whPerKm: null, kwh: null, regenKwh: null, ...f });
const period = (current: Partial<DrivingFigure>, bars: Partial<DrivingFigure>[], previous: Partial<DrivingFigure> | null = null): DrivingPeriod => ({
  current: figure(current),
  previous: previous && figure(previous),
  bars: bars.map(figure),
});

describe("energyCaption", () => {
  test("used, regen and Wh/km, compared on Wh/km with the span before (lower is better)", () => {
    const p = period({ km: 130.6, kwh: 14.5, whPerKm: 111, regenKwh: 2.6 }, [{ km: 100, kwh: 11, regenKwh: 2 }, { km: 30.6, kwh: 3.5, regenKwh: 0.6 }], { km: 120, kwh: 14, whPerKm: 115, regenKwh: 2 });
    expect(energyCaption(p, "the 7 days before")).toBe("14.5 kWh used, 2.6 kWh won back while slowing, 111 Wh/km, 4 Wh/km better than the 7 days before.");
  });
  test("the same Wh/km as before says so", () => {
    const p = period({ km: 100, kwh: 11, whPerKm: 110 }, [{ km: 100, kwh: 11 }], { km: 90, kwh: 10, whPerKm: 111 });
    expect(energyCaption(p, "the 7 days before")).toBe("11.0 kWh used, 110 Wh/km, the same as the 7 days before.");
  });
  test("without Wh/km on both spans, the energy itself is compared", () => {
    const p = period({ km: 100, kwh: 11 }, [{ km: 100, kwh: 11 }], { km: 50, kwh: 6 });
    expect(energyCaption(p, "the 7 days before")).toBe("11.0 kWh used, 5.0 kWh more than the 7 days before.");
  });
  test("regen stays out when none was won; no span before, no comparison", () => {
    const p = period({ km: 100, kwh: 11, whPerKm: 110, regenKwh: 0 }, [{ km: 100, kwh: 11, regenKwh: 0 }]);
    expect(energyCaption(p, null)).toBe("11.0 kWh used, 110 Wh/km.");
  });
  test("the energy used is the bars' sum, like a headline", () => {
    const p = period({ km: 30, kwh: 3.3 }, [{ km: 10, kwh: 1.1 }, { km: 10, kwh: 1.1 }, { km: 10, kwh: 1.1 }]);
    expect(energyCaption(p, null)).toBe("3.3 kWh used.");
  });
  test("driving with no energy reading: no line (the chart's caption names the bars instead)", () => {
    expect(energyCaption(period({ km: 100 }, [{ km: 100 }]), "the 7 days before")).toBeNull();
  });
  test("no driving and no reading: nothing used, nothing to say", () => {
    expect(energyCaption(period({ km: 0 }, [{ km: 0 }]), "the 7 days before")).toBeNull();
  });
});

describe("energyLines", () => {
  test("a bar's kWh and Wh/km, where it has them; never its drives, time or regen", () => {
    expect(energyLines(figure({ km: 12.9, kwh: 1.4, whPerKm: 106, regenKwh: 0.3 }))).toEqual([{ label: "Energy", value: "1.4 kWh" }, { label: "Efficiency", value: "106 Wh/km" }]);
    expect(energyLines(figure({ km: 0.4 }))).toEqual([]);
    expect(energyLines(undefined)).toEqual([]);
  });
});
