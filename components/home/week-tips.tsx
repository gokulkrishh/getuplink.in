"use client";

import { ChevronLeft, ChevronRight, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { voteTip } from "@/app/tip-actions";
import type { Tip, TipScope } from "@/lib/ai-tips";
import type { Vote } from "@/lib/tip-votes";
import { cn } from "@/lib/utils";

// The box, the same while loading, so the page doesn't move when the tips arrive. Five lines of tip text are
// held on a phone and two wider (lib/ai-tips.ts MAX_CHARS keeps every tip within them), so turning between
// a short and a long tip doesn't move it either.
const BOX = "space-y-2 border px-4 py-3";
const TIPS_LINES = "min-h-25 sm:min-h-10";
const NOTE_LINES = "min-h-15 sm:min-h-10";

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
  // Tips swapped in for ones voted down join the end, and the box turns to them.
  const [added, setAdded] = useState<Tip[]>([]);
  // Notes voted not useful, out of the box for good.
  const [hidden, setHidden] = useState<string[]>([]);
  // The note just voted not useful, while another is written in its place. Undo brings it back.
  const [replacing, setReplacing] = useState<Tip | null>(null);
  // The same, for the answer to check it wasn't undone while it was being written.
  const waiting = useRef<Tip | null>(null);
  const tips = [...given, ...added].filter((t) => !hidden.includes(t.text));
  const [votes, setVotes] = useState<Record<string, Vote>>(vote?.votes ?? {});
  // The vote just cast, so only its answer slides in: one from an earlier visit shows still.
  const [justVoted, setJustVoted] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (tips.length === 0 && !replacing) return null;
  const current = !replacing && tips.length > 0 ? tips[at % tips.length] : null;
  const tip = current?.text ?? "";
  const kind = current?.kind;
  const send = (input: Parameters<typeof voteTip>[0]) => startTransition(() => void voteTip(input));
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
    const left = tips.length - 1;
    setAt((k) => (left > 0 ? k % left : 0));
    if (!vote.swap) return send(input);
    // Another is asked for: the box waits for it, then turns to it.
    const down = { text: tip, kind };
    waiting.current = down;
    setReplacing(down);
    startTransition(async () => {
      const fresh = await voteTip(input, vote.swap);
      const current = waiting.current === down;
      // Undone meanwhile: the new note still joins the end, but the box stays where it is.
      if (fresh) setAdded((a) => (a.some((t) => t.text === fresh.text) || given.some((t) => t.text === fresh.text) ? a : [...a, fresh]));
      if (!current) return;
      waiting.current = null;
      setReplacing(null);
      if (fresh) setAt(left);
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
    setAt([...given, ...added].filter((t) => t.text === text || !hidden.includes(t.text)).findIndex((t) => t.text === text));
    send({ scope: vote.scope, entity: vote.entity, kind: downKind, tip: text, vote: 0 });
  };
  const thumb = (value: Vote, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      onClick={() => cast(value)}
      aria-label={label}
      className={cn(CONTROL, "size-6 justify-center transition-[color,scale] active:scale-90")}
    >
      <Icon className="relative top-px size-3.5" aria-hidden="true" />
    </button>
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
          <span className="ai-shimmer">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* ‹ 2 of 3 ›: back and on, each wrapping round. */}
          {current && tips.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <button type="button" onClick={() => setAt((k) => (k + tips.length - 1) % tips.length)} aria-label="Previous tip" className={cn(CONTROL, "size-6 justify-center")}>
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
              <span aria-live="polite">
                {(at % tips.length) + 1} of {tips.length}
              </span>
              <button type="button" onClick={() => setAt((k) => (k + 1) % tips.length)} aria-label="Next tip" className={cn(CONTROL, "size-6 justify-center")}>
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Tips (with votes) hold TIPS_LINES; a one-line note such as a drive's summary holds two lines, as before. */}
      <p className={cn("text-sm text-muted-foreground", vote ? TIPS_LINES : NOTE_LINES, replacing && "animate-pulse")} aria-live="polite">
        {replacing ? "Finding you another tip…" : tip}
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
            <span className={cn("flex items-center gap-2 text-xs text-muted-foreground", justVoted === tip && "motion-safe:animate-vote-in")} aria-live="polite">
              You found this useful
            </span>
          ) : (
            <>
              <span className="mr-1 text-xs leading-4 text-muted-foreground">Was this useful?</span>
              {thumb(1, "Useful", ThumbsUp)}
              {thumb(-1, "Not useful", ThumbsDown)}
            </>
          ))
        )}
      </div>
    </div>
  );
}

// In the notes' place while they load: plain blocks, since there may turn out to be none.
// The empty row under it stands for the vote buttons.
export function AiNotesSkeleton() {
  return (
    <div data-skeleton="tips" aria-hidden="true">
      <div className={BOX}>
        <div className="flex h-6 items-center">
          <div className="h-3 w-16 animate-pulse bg-muted" />
        </div>
        <div className={cn("space-y-2 pt-1", TIPS_LINES)}>
          <div className="h-3 w-full animate-pulse bg-muted" />
          <div className="h-3 w-2/3 animate-pulse bg-muted" />
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
