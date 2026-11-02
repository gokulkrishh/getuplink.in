// The phone's floating page links (PhoneNav in components/header-links.tsx) slide away while the page scrolls down and come back on
// the way up, like Safari's. Pure, so it's tested directly (test/tab-bar.test.ts).

// `shown`: whether the bar is in view. `from`: where the scroll in the current direction started, so a
// change is only made after a real move, not a jitter.
export type BarScroll = { shown: boolean; from: number };

// How far the page has to move before the bar hides (down) or comes back (up), in pixels. Hiding needs the
// longer move, so a small flick while reading leaves it in view; coming back is quicker, as one reaches for it.
export const HIDE_AFTER = 48;
export const SHOW_AFTER = 24;
// Within this of the top or the bottom the bar always shows.
const EDGE = 4;

export const BAR_START: BarScroll = { shown: true, from: 0 };

// The bar after the page scrolled to `y`, with `max` the furthest it scrolls (0 when it can't) and `view`
// the window's height.
export function nextBar(prev: BarScroll, y: number, max: number, view: number): BarScroll {
  // Too short to scroll, at the top, or at the very bottom: always in view.
  if (max <= EDGE || y <= EDGE || (y >= max - EDGE && y <= max)) return { shown: true, from: y };
  // iOS pulls past the top or bottom and springs back: not a scroll.
  if (y < 0 || y > max) return prev;
  const moved = y - prev.from;
  // A jump of more than a screen at once isn't a hand scrolling: the browser putting the page back where it
  // was (Back) or a jump to a part of it. Count from there, and change nothing.
  if (Math.abs(moved) > view) return { shown: prev.shown, from: y };
  if (prev.shown) {
    if (moved > HIDE_AFTER) return { shown: false, from: y };
    // Going up while shown: the next way down counts from the turn.
    return moved < 0 ? { shown: true, from: y } : prev;
  }
  if (moved < -SHOW_AFTER) return { shown: true, from: y };
  return moved > 0 ? { shown: false, from: y } : prev;
}
