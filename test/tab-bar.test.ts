import { describe, expect, test } from "bun:test";
import { BAR_START, type BarScroll, nextBar } from "@/lib/tab-bar";

const VIEW = 800;

// Scrolls through the positions in turn, from the start, on a page that scrolls to `max`.
const run = (ys: number[], max = 2000): BarScroll => ys.reduce((bar, y) => nextBar(bar, y, max, VIEW), BAR_START);

describe("the phone tab bar on scroll", () => {
  // Not too eager: a flick of the thumb while reading (under 48px down) leaves it in view.
  test("hides only after scrolling down 48px, not before", () => {
    expect(run([5, 9]).shown).toBe(true);
    expect(run([100, 300]).shown).toBe(false);
    expect(run([300, 309]).shown).toBe(false);
    expect(nextBar({ shown: true, from: 100 }, 111, 2000, VIEW).shown).toBe(true);
    expect(nextBar({ shown: true, from: 100 }, 140, 2000, VIEW).shown).toBe(true);
    expect(nextBar({ shown: true, from: 100 }, 149, 2000, VIEW).shown).toBe(false);
  });

  test("comes back after scrolling up 24px, counted from the turn", () => {
    expect(run([100, 400, 380]).shown).toBe(false);
    expect(run([100, 400, 375]).shown).toBe(true);
    // Down to 600, so the way up counts from 600, not 400.
    expect(run([100, 400, 600, 580]).shown).toBe(false);
    expect(run([100, 400, 600, 575]).shown).toBe(true);
  });

  test("a small move the other way doesn't flip it", () => {
    // Shown, a little up, then down: hides only once it's gone 48px down from the turn.
    expect(run([100, 400, 370, 365, 410]).shown).toBe(true);
    expect(run([100, 400, 370, 365, 414]).shown).toBe(false);
  });

  test("always shown at the top, at the very bottom, and on a page too short to scroll", () => {
    expect(run([100, 500, 2]).shown).toBe(true);
    expect(run([100, 500, 1000, 2000]).shown).toBe(true);
    expect(run([100, 500, 1000, 1998]).shown).toBe(true);
    expect(nextBar({ shown: false, from: 0 }, 0, 0, VIEW).shown).toBe(true);
  });

  test("iOS pulling past either end changes nothing", () => {
    const hidden = run([100, 500]);
    expect(nextBar(hidden, 2050, 2000, VIEW)).toEqual(hidden);
    expect(nextBar({ shown: false, from: 300 }, -30, 2000, VIEW).shown).toBe(true); // within the top edge rule
  });

  test("Back putting the page far down shows it still, and the next scroll counts from there", () => {
    // Arriving at the top, then the browser restores 1500: no hiding for that jump.
    const restored = run([0, 1500]);
    expect(restored).toEqual({ shown: true, from: 1500 });
    // Then a real scroll down hides it, and one up brings it back.
    expect(run([0, 1500, 1550]).shown).toBe(false);
    expect(run([0, 1500, 1550, 1525]).shown).toBe(true);
    // Hidden, a jump up of more than a screen leaves it hidden until a real scroll up.
    expect(nextBar({ shown: false, from: 1600 }, 300, 2000, VIEW)).toEqual({ shown: false, from: 300 });
  });
});
