import { describe, expect, test } from "bun:test";
import { tipsInView, turn, turnedTo } from "@/lib/tips-in-view";

const A = { kind: "a", text: "Tip A" };
const B = { kind: "b", text: "Tip B" };
const C = { kind: "c", text: "Tip C" };
const texts = (v: { tips: { text: string }[]; index: number }) => ({ tips: v.tips.map((t) => t.text), on: v.tips[v.index]?.text });

// The owner's report: "1 of 2", the first voted down, another tip written in its place. The vote's action
// calls updateTag, so the page renders again and the tips from the server (`given`) now leave out the voted
// tip and hold the fresh one, which the box has also added itself.
describe("a tip voted down and swapped", () => {
  test("action answers first, then the page renders again: the fresh tip shows once, and is the one up", () => {
    // What the box holds once the swap lands: the fresh tip added, the box sent to it.
    const before = tipsInView({ given: [A, B], added: [C], hidden: [A.text], dismissed: [], at: 1, on: C.text });
    expect(texts(before)).toEqual({ tips: [B.text, C.text], on: C.text });
    // Then the page's new render: A is gone (voted down) and C is stored.
    const after = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [], at: 1, on: C.text });
    expect(texts(after)).toEqual({ tips: [B.text, C.text], on: C.text });
  });

  test("the page renders again before the action answers: the same end", () => {
    const waiting = tipsInView({ given: [B, C], added: [], hidden: [A.text], dismissed: [], at: 0 });
    expect(waiting.tips.map((t) => t.text)).toEqual([B.text, C.text]);
    const landed = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [], at: 0, on: C.text });
    expect(texts(landed)).toEqual({ tips: [B.text, C.text], on: C.text });
  });

  test("Next and Previous step over distinct tips only", () => {
    const view = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [], at: 0, on: C.text });
    const next = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [], at: turn(view, 1) });
    expect(texts(next).on).toBe(B.text);
    const back = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [], at: turn(view, -1) });
    expect(texts(back).on).toBe(B.text);
  });

  test("no fresh tip: only the other one is left", () => {
    const view = tipsInView({ given: [B], added: [], hidden: [A.text], dismissed: [], at: 0 });
    expect(texts(view)).toEqual({ tips: [B.text], on: B.text });
  });

  test("the last tip voted down with nothing in its place: an empty box", () => {
    const view = tipsInView({ given: [], added: [], hidden: [A.text], dismissed: [], at: 3 });
    expect(view).toEqual({ tips: [], index: 0 });
  });

  test("a second swap: the first fresh tip is now from the server too", () => {
    const D = { kind: "d", text: "Tip D" };
    const view = tipsInView({ given: [B, D], added: [C, D], hidden: [A.text, C.text], dismissed: [], at: 1, on: D.text });
    expect(texts(view)).toEqual({ tips: [B.text, D.text], on: D.text });
  });
});

describe("Undo while another tip is written", () => {
  test("the tip comes back and is the one up, even when the earlier vote's render has left it out", () => {
    // Undo puts the tip back in `added` and sends the box to it; the vote's render (A voted down) lands after.
    const view = tipsInView({ given: [B, C], added: [A, C], hidden: [], dismissed: [], at: 1, on: A.text });
    expect(texts(view)).toEqual({ tips: [B.text, C.text, A.text], on: A.text });
    // Then the undo's own render: A is back where it was.
    const later = tipsInView({ given: [A, B, C], added: [A, C], hidden: [], dismissed: [], at: 1, on: A.text });
    expect(texts(later)).toEqual({ tips: [A.text, B.text, C.text], on: A.text });
  });
});

describe("turning", () => {
  test("the tip turned to stays up when the page renders again with the tips in another order", () => {
    // A thumbs-up also renders the page again; the server may list the tips in a new order.
    const start = tipsInView({ given: [A, B, C], added: [], hidden: [], dismissed: [], at: 0 });
    const on = turnedTo(start, 1);
    expect(on).toBe(B.text);
    const reordered = tipsInView({ given: [C, A, B], added: [], hidden: [], dismissed: [], at: 1, on });
    expect(texts(reordered).on).toBe(B.text);
    expect(turnedTo(tipsInView({ given: [], added: [], hidden: [], dismissed: [], at: 0 }), 1)).toBeNull();
  });
});

describe("dismissed tips", () => {
  test("a dismissed tip stays out, from the server or swapped in", () => {
    const view = tipsInView({ given: [B, C], added: [C], hidden: [A.text], dismissed: [C.text], at: 0, on: C.text });
    expect(texts(view)).toEqual({ tips: [B.text], on: B.text });
  });

  test("the index wraps when the list is shorter than where the box was", () => {
    const view = tipsInView({ given: [A, B, C], added: [], hidden: [], dismissed: [B.text], at: 5 });
    expect(texts(view)).toEqual({ tips: [A.text, C.text], on: C.text });
  });
});
