"use client";

import { Check, SmilePlus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { sendFeedback } from "@/app/feedback/actions";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { FEEDBACK_EVENT } from "@/components/feedback-open";
import { BOTHER, type Bother, botherLabel, isProblem, MESSAGE_MAX, type Topic, TOPICS, topicLabel } from "@/lib/feedback";
import { OFFLINE, orOffline } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { PendingLabel } from "@/components/pending-label";

// The theme the owner is looking at: their pick, else the system's.
function theme(): "light" | "dark" {
  const picked = document.documentElement.dataset.theme;
  if (picked === "light" || picked === "dark") return picked;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Choices<T extends string>({ legend, options, value, onChange }: { legend: string; options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-ring",
              value === o.value && "border-foreground bg-foreground text-background hover:bg-foreground",
            )}
          >
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The feedback button in the corner of every signed-in page. The form asks how Uplink feels, what it's
// about and what happened; the page, screen size, browser and theme go with it, so a report can be found
// without asking again (Admin > Feedback).
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  // Read when the form opens, not with usePathname, so the button doesn't hold up a page's static shell.
  const [path, setPath] = useState("");
  const [bother, setBother] = useState<Bother | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const problem = isProblem(topic);
  const ready = topic !== null && (!problem || bother !== null) && message.trim().length > 0;
  // The words box asks what fits the topic.
  const prompt =
    topic === "idea"
      ? { label: "What's your idea?", hint: "What would make Uplink better for you." }
      : topic === "praise"
        ? { label: "What do you like?", hint: "What works well, so it stays that way." }
        : { label: "What happened?", hint: "What you saw, and what you expected." };

  // Other places (the phone account menu) ask for the form through a window event.
  useEffect(() => {
    const show = () => {
      setPath(location.pathname);
      setOpen(true);
    };
    window.addEventListener(FEEDBACK_EVENT, show);
    return () => window.removeEventListener(FEEDBACK_EVENT, show);
  }, []);

  const reset = () => {
    setBother(null);
    setTopic(null);
    setMessage("");
    setError(null);
    setSent(false);
  };
  const send = () =>
    start(async () => {
      if (!topic) return;
      const result = await orOffline(
        sendFeedback({
        bother: problem ? bother : null,
        topic,
        message,
        pagePath: `${location.pathname}${location.search}`.slice(0, 300),
        pageTitle: document.title.slice(0, 200),
        viewport: `${innerWidth}x${innerHeight}`,
        userAgent: navigator.userAgent.slice(0, 400),
        theme: theme(),
        }),
        { ok: false, error: OFFLINE },
      );
      if (result.ok) setSent(true);
      else setError(result.error);
    });

  return (
    <>
    {/* Room under the page for the button (44px, 16px off the bottom), so the end of every page can be
        scrolled clear of it. Phones have no floating button (feedback is in the account menu), so only sm and up. Hoisted by React into the head; it matches only while the button is on the page. */}
    <style href="feedback-button-room" precedence="default">{"@media (min-width:40rem){body:has([data-feedback-button]){padding-bottom:3.75rem}}"}</style>
    <Drawer
      open={open}
      // A tap outside doesn't close it, so a half-written message isn't lost. The ×, Esc and Done do.
      disablePointerDismissal
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPath(location.pathname);
        if (!next && sent) reset();
      }}
    >
      <DrawerTrigger
        data-feedback-button
        aria-label="Send feedback"
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex max-sm:hidden size-11 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SmilePlus className="size-5" aria-hidden="true" />
      </DrawerTrigger>
      {/* From sm up it opens in the corner, by the button, rather than in the middle. */}
      <DrawerContent
        keyboard
        className="sm:fixed sm:right-[max(1rem,env(safe-area-inset-right))] sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:w-96"
        bodyClassName="px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-5"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <DrawerTitle>{sent ? "Feedback sent" : "Send feedback"}</DrawerTitle>
          <DrawerClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" className="-mt-1 -mr-2 text-muted-foreground" />} nativeButton>
            <X className="size-4" aria-hidden="true" />
          </DrawerClose>
        </div>
        {sent ? (
          // What was sent, read back, so the owner sees it landed and what it said.
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-charge/15 text-charge">
                <Check className="size-5" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <p className="font-medium">Thanks for telling us.</p>
                <p className="text-muted-foreground">It goes straight to the person who builds Uplink, who reads every one.</p>
              </div>
            </div>
            <figure className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <figcaption className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-md border px-2 py-0.5">{topic && topicLabel(topic)}</span>
                {problem && bother && <span className="rounded-md border px-2 py-0.5">{botherLabel(bother)}</span>}
              </figcaption>
              <blockquote className="line-clamp-4 whitespace-pre-wrap">{message.trim()}</blockquote>
              <p className="text-xs text-faint">From {path}</p>
            </figure>
            <div className="flex items-center gap-3">
              <DrawerClose render={<Button className="flex-1">Done</Button>} />
              <Button variant="outline" className="flex-1" onClick={reset}>
                Send more
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) send();
            }}
          >
            <Choices legend="What's it about?" options={TOPICS} value={topic} onChange={setTopic} />
            {problem && <Choices legend="How much is it bothering you?" options={BOTHER} value={bother} onChange={setBother} />}
            <div className="space-y-2">
            <label className="block space-y-2">
              <span className="block text-sm font-medium">{prompt.label}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                rows={4}
                placeholder={prompt.hint}
                className="block w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus-visible:outline-2 focus-visible:outline-ring"
              />
            </label>
            <p className="text-xs text-muted-foreground">Sent with the page you&apos;re on ({path}), your screen size and browser, so it&apos;s easy to find.</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!ready || pending} className="relative w-full">
              <PendingLabel pending={pending} label="Send feedback" pendingLabel="Sending" />
            </Button>
          </form>
        )}
      </DrawerContent>
    </Drawer>
    </>
  );
}
