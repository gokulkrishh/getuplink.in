"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { PendingLabel } from "@/components/pending-label";
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { OFFLINE, orOffline } from "@/lib/offline";
import {
  DEFAULT_VIEW_LINK_LENGTH,
  endsAt,
  isUsedLink,
  openedLine,
  SHARES_EVERYTHING,
  VIEW_LINK_LABEL_MAX,
  VIEW_LINK_LENGTHS,
  VIEW_LINK_LIMIT,
  type ViewLink,
  viewLinkLabel,
  viewLinkUrl,
} from "@/lib/view-links";
import { copyViewLinkAction, endViewLinkAction, makeViewLinkAction, setViewLinkHideLocationsAction } from "./actions";
import { cn } from "@/lib/utils";
import { Row } from "./row";
import { haptic } from "@/components/haptic";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";


// Copy link on an open row: the link is rebuilt on the server (copyViewLinkAction) and put on the clipboard.
// The clipboard gets a promise of the text, so Safari still counts it as the click's. Where the clipboard
// is refused, the link shows under the row to copy by hand.
function CopyLinkButton({ id, onShow, onError }: { id: number; onShow: (url: string | null) => void; onError: (error: string | null) => void }) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const copy = () =>
    start(async () => {
      onError(null);
      const url = orOffline(copyViewLinkAction(id), { error: OFFLINE }).then((result) => {
        if ("error" in result) throw new CopyRefused(result.error);
        return viewLinkUrl(window.location.origin, result.token);
      });
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })) })]);
        } else {
          await navigator.clipboard.writeText(await url);
        }
        onShow(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // The clipboard rejects with its own error, whatever went wrong: ask the link itself. Refused by the
        // server, say why; otherwise the clipboard said no, so show the link to copy by hand.
        const settled = await url.then(
          (u) => ({ u }),
          (e: unknown) => ({ e }),
        );
        if ("u" in settled) return onShow(settled.u);
        onError(settled.e instanceof CopyRefused ? settled.e.message : OFFLINE);
      }
    });
  return (
    // Both labels share one grid cell, so the button keeps the wider one's width when "Copied" shows. The
    // spinner is the button's own child, centred by its flex box (inside an inline span it would sit after
    // the hidden label and spill past the edge). The link is rebuilt on the server, so it isn't instant.
    <Button type="button" variant="outline" size="sm" className="relative shrink-0" disabled={pending} aria-busy={pending} onClick={copy}>
      <span aria-live="polite" className={cn("grid", pending && "opacity-0")}>
        <span className={cn("col-start-1 row-start-1", copied && "invisible")}>Copy link</span>
        <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>Copied</span>
      </span>
      {pending && <Loader2 className="absolute size-[1.1em] animate-spin motion-reduce:animate-none" role="img" aria-label="Copying" />}
    </Button>
  );
}

class CopyRefused extends Error {}

// Hide locations for an open link, changeable while it's open: the guest sees the change on their next page,
// or within half a minute. Shows the new state once it's saved, like Settings' Share switch.
function HideLocationsSwitch({ link, onChange }: { link: ViewLink; onChange: (hide: boolean) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const on = link.hideLocations;
  const change = () =>
    start(async () => {
      const failed = await orOffline(setViewLinkHideLocationsAction(link.id, !on), OFFLINE);
      setError(failed);
      if (!failed) onChange(!on);
    });
  return (
    <div className="space-y-1">
      {/* The label is the 44px tap area and the switch's name; the switch is shadcn's. */}
      <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm", pending && "cursor-wait opacity-60")}>
        <Switch checked={on} disabled={pending} onCheckedChange={change} />
        Hide locations
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// One open link: who it's for and when it ends, with Copy link (until it's used) and End link (which asks
// first) level with that line; then whether it was opened; then Hide locations.
function ViewLinkItem({ link: initial, now }: { link: ViewLink; now: number }) {
  const [link, setLink] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = () =>
    start(async () => {
      const failed = await orOffline(endViewLinkAction(link.id), OFFLINE);
      setError(failed);
      if (!failed) setAsking(false);
    });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 pt-1.5 text-sm">
          {link.label} <span className="text-muted-foreground">· {endsAt(link.expiresAt, now)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* A link opens in one browser: once used, there's nothing left to send. */}
          {!isUsedLink(link) && <CopyLinkButton id={link.id} onShow={setShownUrl} onError={setCopyError} />}
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setAsking(true)}>
            End link
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{openedLine(link, now)}</p>
      {copyError && (
        <p role="alert" className="text-sm text-destructive">
          {copyError}
        </p>
      )}
      {shownUrl && !isUsedLink(link) && (
        <LinkBox url={shownUrl}>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShownUrl(null)}>
            Done
          </Button>
        </LinkBox>
      )}
      <HideLocationsSwitch link={link} onChange={(hideLocations) => setLink({ ...link, hideLocations })} />
      <AlertDialog
        open={asking}
        onOpenChange={(open) => {
          if (pending) return;
          setAsking(open);
          if (!open) setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>End the link for {link.label}?</AlertDialogTitle>
          <AlertDialogDescription>It stops working at once.</AlertDialogDescription>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="ghost" size="lg" disabled={pending} />}>Cancel</AlertDialogClose>
            <Button ref={haptic} type="button" variant="destructive" size="lg" className="relative" disabled={pending} aria-busy={pending} onClick={end}>
              <PendingLabel pending={pending} label="End link" pendingLabel="Ending" />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// The form in the Create guest link sheet: who it's for, how long it lasts, Hide locations and the tick box.
// The sheet mounts a fresh one each time it opens, so it always starts empty.
function MakeViewLink({ onMade }: { onMade: (made: { label: string; token: string }) => void }) {
  const [label, setLabel] = useState("");
  const [length, setLength] = useState<string>(DEFAULT_VIEW_LINK_LENGTH);
  const [trusted, setTrusted] = useState(false);
  const [hides, setHides] = useState(SHARES_EVERYTHING);
  // `name`: the error is about the name field, so only then is the field marked.
  const [error, setError] = useState<{ message: string; name: boolean } | null>(null);
  const [pending, start] = useTransition();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!viewLinkLabel(label)) return setError({ message: `Say who it's for, in up to ${VIEW_LINK_LABEL_MAX} characters.`, name: true });
    if (!trusted) return setError({ message: "Tick the box to confirm you trust this person.", name: false });
    start(async () => {
      const result = await orOffline(makeViewLinkAction(label, length, trusted, hides), { error: OFFLINE });
      if ("error" in result) return setError({ message: result.error, name: false });
      setError(null);
      onMade(result);
    });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Who is it for
          <Input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError(null);
            }}
            {...NO_AUTOFILL}
            aria-invalid={error?.name ? true : undefined}
            aria-describedby={error ? "view-link-error" : undefined}
            placeholder="Dad"
            maxLength={VIEW_LINK_LABEL_MAX}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Lasts
          <NativeSelect value={length} onChange={(e) => setLength(e.target.value)}>
            {VIEW_LINK_LENGTHS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {/* The two tick boxes sit together: 32px rows, a little taller on a phone for the thumb. Hide locations can be
          changed later, while the link is open, from its row under Guest access. */}
      <div>
        <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2 text-sm max-sm:min-h-9">
          <Checkbox checked={hides.hideLocations} onCheckedChange={(checked) => setHides({ hideLocations: checked })} />
          Hide locations
        </label>
        <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2 text-sm max-sm:min-h-9">
          <Checkbox
            checked={trusted}
            onCheckedChange={(checked) => {
              setTrusted(checked);
              setError(null);
            }}
            required
          />
          I trust this person with what I&apos;m sharing
        </label>
      </div>
      {/* The error shares the button's row, so the button never moves when it appears. */}
      <div className="flex items-center justify-between gap-3">
        <p id="view-link-error" role="alert" className="text-sm text-destructive">
          {error?.message}
        </p>
        <Button ref={haptic} type="submit" size="lg" className="relative" disabled={pending || !trusted} aria-busy={pending}>
          <PendingLabel pending={pending} label="Create guest link" pendingLabel="Creating" />
        </Button>
      </div>
    </form>
  );
}

// A link to copy by hand, with Copy link: the new link, or an open one the clipboard refused.
function LinkBox({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-sm select-all">{url}</code>
      <CopyButton text={url} label="Copy link" />
      {children}
    </div>
  );
}

// Settings → Guest access: a row like the others, with Create guest link on the right (not offered at the
// limit, until a link ends), and the open links under it with Copy link and End link on each. The button
// opens a sheet with the form, which shows the new link once it's made. The new link's state lives here, not
// in the form, so the list refreshing after the make doesn't hide it. `links` is null before the table exists.
export function ViewLinks({ links, now }: { links: ViewLink[] | null; now: number }) {
  const [open, setOpen] = useState(false);
  // The new link, shown in the form's place until the sheet closes.
  const [made, setMade] = useState<{ label: string; url: string } | null>(null);
  // Read when a make finishes: one finishing after the sheet was closed doesn't fill the next opening.
  const openRef = useRef(false);
  const offered = links !== null && links.length < VIEW_LINK_LIMIT;

  return (
    // The sheet's root renders nothing of its own, so it wraps the whole row: the sheet stays open when the
    // last allowed link is made and the button goes.
    <Drawer
      open={open}
      // A tap outside doesn't close it, so a half-filled form isn't lost. The ×, Esc, a swipe down and Done do.
      disablePointerDismissal
      onOpenChange={(next) => {
        openRef.current = next;
        setOpen(next);
      }}
      // Once it has slid away, so the form doesn't flash back while the sheet closes.
      onOpenChangeComplete={(next) => {
        if (!next) setMade(null);
      }}
    >
      <Row
        title="Guest access"
        description="Let someone you trust see your car data."
        control={
          offered && (
            <DrawerTrigger render={<Button type="button" variant="outline" size="lg" />}>Create guest link</DrawerTrigger>
          )
        }
      >
        {links === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Guest access isn&apos;t set up yet.</p>
        ) : (
          links.length > 0 && (
            <ul className="mt-4 divide-y border-y">
              {links.map((l) => (
                <ViewLinkItem key={l.id} link={l} now={now} />
              ))}
            </ul>
          )
        )}
      </Row>
      <DrawerContent title={made ? `Guest link for ${made.label}` : "Create guest link"} keyboard className="sm:w-md" bodyClassName="px-5 pt-3 pb-5">
        {made ? (
          <div className="space-y-4">
            <LinkBox url={made.url} />
            <div className="flex justify-end">
              <DrawerClose render={<Button type="button" size="lg" />}>Done</DrawerClose>
            </div>
          </div>
        ) : (
          <MakeViewLink
            onMade={({ label, token }) => {
              if (openRef.current) setMade({ label, url: viewLinkUrl(window.location.origin, token) });
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
