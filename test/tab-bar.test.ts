import { describe, expect, test } from "bun:test";
import { BAR_START, type BarScroll, nextBar } from "@/lib/tab-bar";

// Scrolls through the positions in turn, from the start, on a page that scrolls to `max`.
const run = (ys: number[], max = 2000): BarScroll => ys.reduce((bar, y) => nextBar(bar, y, max), BAR_START);

describe("the phone tab bar on scroll", () => {
  test("hides after scrolling down past the threshold, not before", () => {
    expect(run([5, 9]).shown).toBe(true);
    expect(run([100, 300]).shown).toBe(false);
    expect(run([300, 309]).shown).toBe(false);
    expect(nextBar({ shown: true, from: 100 }, 108, 2000).shown).toBe(true);
    expect(nextBar({ shown: true, from: 100 }, 111, 2000).shown).toBe(false);
  });

  test("comes back after scrolling up past the threshold, counted from the turn", () => {
    expect(run([100, 400, 395]).shown).toBe(false);
    expect(run([100, 400, 380]).shown).toBe(true);
    // Down to 600, so the way up counts from 600, not 400.
    expect(run([100, 400, 600, 595]).shown).toBe(false);
    expect(run([100, 400, 600, 580]).shown).toBe(true);
  });

  test("a small move the other way doesn't flip it", () => {
    // Shown, a little up, then down: hides only once it's gone the threshold down from the turn.
    expect(run([100, 400, 380, 375, 384]).shown).toBe(true);
    expect(run([100, 400, 380, 375, 386]).shown).toBe(false);
  });

  test("always shown at the top, at the very bottom, and on a page too short to scroll", () => {
    expect(run([100, 500, 2]).shown).toBe(true);
    expect(run([100, 500, 1000, 2000]).shown).toBe(true);
    expect(run([100, 500, 1000, 1998]).shown).toBe(true);
    expect(nextBar({ shown: false, from: 0 }, 0, 0).shown).toBe(true);
  });

  test("iOS pulling past either end changes nothing", () => {
    const hidden = run([100, 500]);
    expect(nextBar(hidden, 2050, 2000)).toEqual(hidden);
    expect(nextBar({ shown: false, from: 300 }, -30, 2000).shown).toBe(true); // within the top edge rule
  });
});
