import { HOME_PERIODS, type HomePeriod } from "@/components/stats/periods";
import { timeframeEfficiency } from "@/lib/drive-stats";
import type { DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import type { Drive } from "@/lib/drives";
import { type DayRange, periodTimeframe, type Timeframe } from "@/lib/periods";

// One choice of a period switch: what it covers and the primary car's driving figures for it (null when
// they couldn't be read).
export type Frame = { key: HomePeriod; frame: Timeframe; driving: DrivingPeriod | null };

// A range picked by date, what it covers and its driving figures as the counters gave them.
export type CustomFrame = { range: DayRange; frame: Timeframe; driving: DrivingPeriod | null };

// Every choice of the switch: each period, then the range picked by date when there is one. Energy and
// efficiency come from the drives where they cover the span (see timeframeEfficiency); `figures` already
// has that for the periods (see withDriveEfficiency).
export function periodFrames(figures: DrivingFigures, custom: CustomFrame | null, drives: Drive[], now: number): Frame[] {
  return HOME_PERIODS.flatMap(({ value }): Frame[] => {
    if (value !== "custom") return [{ key: value, frame: periodTimeframe(value, now), driving: figures.periods[value] }];
    if (!custom) return [];
    return [{ key: value, frame: custom.frame, driving: custom.driving && timeframeEfficiency(custom.driving, custom.frame, drives, figures.since, now) }];
  });
}

// Every choice of the switch for a page that reads no driving figures (Battery): each period, then the
// range picked by date when there is one.
export function timeframes(custom: Timeframe | null, now: number): Frame[] {
  return HOME_PERIODS.flatMap(({ value }): Frame[] => {
    if (value !== "custom") return [{ key: value, frame: periodTimeframe(value, now), driving: null }];
    return custom ? [{ key: value, frame: custom, driving: null }] : [];
  });
}
