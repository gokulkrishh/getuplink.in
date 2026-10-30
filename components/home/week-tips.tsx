"use client";

import { ChevronLeft, ChevronRight, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { voteTip } from "@/app/tip-actions";
import type { Tip, TipScope } from "@/lib/ai-tips";
import { Button } from "@/components/ui/button";
import { orOffline } from "@/lib/offline";
import type { Vote } from "@/lib/tip-votes";
import { tipsInView, turn, turnedTo } from "@/lib/tips-in-view";
import { cn } from "@/lib/utils";

// The box. Its text is as tall as the longest note in it, no taller: every note sits in the same grid cell,
// all but the one showing unseen, so turning between a short and a long tip doesn't move the page, and
// short tips don't leave an empty box.
const BOX = "space-y-2 rounded-lg border px-4 py-3";
// A card's × in its top-right corner, matched with the share card's.
export const DISMISS_X = "-my-1 -mr-1.5 shrink-0 max-sm:-my-2";
const THANKS_MS = 5000;
const DISMISSED_KEY = "uplink:tips-dismissed";
const DISMISSED_MAX = 200;

// Where the notes' votes go: the kind of page, the page (a day's start, a drive's start or a charge's id) and
// the owner's votes so far, by tip. `swap` is where the tips are kept (the car and their time), so a tip
// voted down can be swapped for another (lib/server/ai-tips.ts replaceTip).
export type NoteVotes = { scope: TipScope; entity: string; votes: Record<string, Vote>; swap?: { vehicleId: string; at: number } };

const CONTROL =
  "tap-target inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground tabular-nums transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

// Text the AI wrote, in one box style wherever it stands alone: the tips on Home, a drive, Stats > Charging
// and a charge (lib/ai-tips.ts), and a drive's summary (lib/drive-wording.ts). Several notes show one at a
// time; the next button turns them, and they were written ahead, so turning costs nothing. With `vote`, each
// note can be marked useful or not. Useful stays, with no Undo. Not useful takes the note out of
// the box: while another is written in its place the box says so, with Undo, then shows the new one.
export function AiNotes({ title, notes: given, vote }: { title: string; notes: (Pick<Tip, "text"> & Partial<Pick<Tip, "kind">>)[]; vote?: NoteVotes }) {
  const [at, setAt] = useState(0);
  // A tip the box was sent to by its text (one swapped in, or brought back by Undo), so it stays up when the
  // page renders again and the list around it changes.
  const [on, setOn] = useState<string | null>(null);
  // Tips swapped in for ones voted down join the end, and the box turns to them.
  const [added, setAdded] = useState<Tip[]>([]);
  // Notes voted not useful, out of the box for good.
  const [hidden, setHidden] = useState<string[]>([]);
  // The note just voted not useful, while another is written in its place. Undo brings it back.
  const [replacing, setReplacing] = useState<Tip | null>(null);
  // The same, for the answer to check it wasn't undone while it was being written.
  const waiting = useRef<Tip | null>(null);
  const [votes, setVotes] = useState<Record<string, Vote>>(vote?.votes ?? {});
  // The vote just cast, so only its answer slides in: one from an earlier visit shows still.
  const [justVoted, setJustVoted] = useState<string | null>(null);
  // The thanks for a useful vote shows for a few seconds, then the row is left empty.
  useEffect(() => {
    if (justVoted === null) return;
    const id = setTimeout(() => setJustVoted(null), THANKS_MS);
    return () => clearTimeout(id);
  }, [justVoted]);
  const [, startTransition] = useTransition();
  // Tips the owner dismissed, by their text, in this browser: a dismissed tip never shows again, on any page.
  // Dismissing isn't a vote. Kept to the latest DISMISSED_MAX.
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
      if (Array.isArray(saved)) setDismissed(saved.filter((t): t is string => typeof t === "string"));
    } catch {}
  }, []);
  const view = tipsInView({ given, added, hidden, dismissed, at, on });
  const shownTips = view.tips;
  if (shownTips.length === 0 && !replacing) return null;
  const current = !replacing && shownTips.length > 0 ? shownTips[view.index] : null;
  // Kept on the tip turned to by its text, so a vote's new render can't move the box to another one.
  const turnTo = (by: 1 | -1) => {
    setAt(turn(view, by));
    setOn(turnedTo(view, by));
  };
  const dismiss = () => {
    if (!current) return;
    const next = [...dismissed.filter((t) => t !== current.text), current.text].slice(-DISMISSED_MAX);
    setDismissed(next);
    setAt(shownTips.length > 1 ? view.index % (shownTips.length - 1) : 0);
    setOn(null);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {}
  };
  const tip = current?.text ?? "";
  const kind = current?.kind;
  const shown = replacing ? "Finding you another tip…" : tip;
  // A vote that can't be sent is dropped: it isn't worth an error.
  const send = (input: Parameters<typeof voteTip>[0]) => startTransition(() => void orOffline(voteTip(input), null));
  const cast = (value: Vote) => {
    if (!vote || !kind) return;
    // Tapping the chosen one again takes the vote back.
    const next = votes[tip] === value ? 0 : value;
    setVotes(({ [tip]: _, ...rest }) => (next === 0 ? rest : { ...rest, [tip]: next }));
    setJustVoted(next === 0 ? null : tip);
    const input = { scope: vote.scope, entity: vote.entity, kind, tip, vote: next };
    if (next !== -1) return send(input);
    // Not useful: the note leaves, and the next one takes its place.
    setHidden((h) => [...h, tip]);
    const left = shownTips.length - 1;
    setAt(left > 0 ? view.index % left : 0);
    setOn(null);
    if (!vote.swap) return send(input);
    // Another is asked for: the box waits for it, then turns to it.
    const down = { text: tip, kind };
    waiting.current = down;
    setReplacing(down);
    startTransition(async () => {
      // No answer (or no connection): the box stops waiting and shows the tips it has.
      const fresh = await orOffline(voteTip(input, vote.swap), null);
      const current = waiting.current === down;
      // Undone meanwhile: the new note still joins the end, but the box stays where it is.
      // The vote also renders the page again, so the new note can arrive in `given` as well: tipsInView shows it once.
      if (fresh) setAdded((a) => (a.some((t) => t.text === fresh.text) ? a : [...a, fresh]));
      if (!current) return;
      waiting.current = null;
      setReplacing(null);
      if (fresh) setOn(fresh.text);
    });
  };
  // Undo while the replacement is written: the vote is taken back and the note returns.
  const undo = () => {
    if (!vote || !replacing?.kind) return;
    const { text, kind: downKind } = replacing;
    setHidden((h) => h.filter((t) => t !== text));
    setVotes(({ [text]: _, ...rest }) => rest);
    setJustVoted(null);
    waiting.current = null;
    setReplacing(null);
    // Back in the box: from `given` when the server still lists it, else kept in `added`, so `added` never fills
    // up with tips the server already has.
    setAdded((a) => (a.some((t) => t.text === text) || given.some((t) => t.text === text) ? a : [...a, { text, kind: downKind }]));
    setOn(text);
    send({ scope: vote.scope, entity: vote.entity, kind: downKind, tip: text, vote: 0 });
  };
  const thumb = (value: Vote, label: string, Icon: typeof ThumbsUp) => (
    <Button type="button" variant="ghost" size="icon-sm" onClick={() => cast(value)} aria-label={label} className="text-muted-foreground max-sm:w-7">
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
  const box = (
    <section aria-label={title} className={BOX}>
      <div className="flex h-6 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {/* The AI mark. */}
          <span className="flex size-5 items-center justify-center text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Written by AI</span>
          </span>
          {/* Shimmers once as the notes arrive; turning to the next one doesn't replay it. */}
          <span className="ai-shimmer" data-text={title}>{title}</span>
        </div>
        {/* On a phone each button's tap area is 44px wide, so they sit far enough apart not to overlap. */}
        <div className="flex items-center gap-3 max-sm:gap-4">
          {/* ‹ 2 of 3 ›: back and on, each wrapping round. */}
          {current && shownTips.length > 1 && (
            <div className="-my-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums max-sm:-my-2">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => turnTo(-1)} aria-label="Previous tip" className="text-muted-foreground">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <span aria-live="polite">
                {view.index + 1} of {shownTips.length}
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => turnTo(1)} aria-label="Next tip" className="text-muted-foreground">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          {vote && (
            // The same × as the share card's (components/home/share-nudge.tsx): size, icon and right edge. The
            // negative margins keep the header row's height, so the box doesn't grow.
            <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss this tip" title="Dismiss this tip" className={DISMISS_X}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {/* The note shimmers with the title, so the sweep is seen across the words being read. The unseen notes
          only give the cell its height; while a tip is replaced, the one voted down still holds its height, so
          the box keeps its size until the new one arrives. */}
      <p className="ai-shimmer grid text-sm" data-text={shown}>
        <span className={cn("col-start-1 row-start-1", replacing && "animate-pulse")} aria-live="polite">
          {shown}
        </span>
        {[...shownTips.map((t) => t.text), ...(replacing ? [replacing.text] : [])]
          .filter((text) => text !== shown)
          .map((text) => (
            <span key={text} aria-hidden="true" className="invisible col-start-1 row-start-1">
              {text}
            </span>
          ))}
      </p>
    </section>
  );
  if (!vote) return box;
  // Was this useful: under the box's bottom right corner. The row is kept even for a tip that can't be voted
  // on, so the box below doesn't move.
  return (
    <div>
      {box}
      <div className={cn("flex h-8 items-center justify-end", !votes[tip] && !replacing && "-mr-1")}>
        {/* Before a vote: the question and both thumbs. After a useful vote: just that. While a
            note voted not useful is replaced, Undo brings it back. */}
        {replacing ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground motion-safe:animate-vote-in" aria-live="polite">
            Tip hidden
            <button type="button" onClick={undo} className="tap-target rounded-sm underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              Undo
            </button>
          </span>
        ) : (
          kind &&
          (votes[tip] ? (
            justVoted === tip && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground motion-safe:animate-vote-in" aria-live="polite">
                You found this useful
              </span>
            )
          ) : (
            <>
              <span className="mr-0.5 text-xs leading-4 text-muted-foreground">Was this useful?</span>
              <span className="flex items-center">
                {thumb(1, "Useful", ThumbsUp)}
                {thumb(-1, "Not useful", ThumbsDown)}
              </span>
            </>
          ))
        )}
      </div>
    </div>
  );
}
