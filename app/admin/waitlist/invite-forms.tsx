"use client";

import { Check, Copy, Share } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LinkResult } from "./actions";

const field =
  "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// A link the admin just made or asked for again, with Copy and, where the browser has it, Share (so it
// can go straight to WhatsApp). Uplink sends nothing itself.
export function LinkPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => setCopied(false), [url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = () => navigator.share({ title: "Uplink invite", url }).catch(() => {});
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono text-xs`} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare && (
          <Button type="button" size="sm" variant="outline" onClick={share}>
            <Share aria-hidden />
            Share
          </Button>
        )}
      </div>
      <p className="text-xs text-faint">Works once, for a day, for the car you named.</p>
    </div>
  );
}

function Message({ result }: { result: LinkResult }) {
  return result?.message ? (
    <p role="alert" className="text-xs text-destructive">
      {result.message}
    </p>
  ) : null;
}

// "Create invite link": the friend's last 6 VIN characters and an optional label, then the link.
export function CreateInvite({ action }: { action: (previous: LinkResult, form: FormData) => Promise<LinkResult> }) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Last 6 of the VIN</span>
          <input
            name="vin"
            required
            minLength={6}
            maxLength={6}
            pattern="[A-Za-z0-9]{6}"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="A12345"
            className={`${field} font-mono uppercase`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Label (optional)</span>
          <input name="label" maxLength={60} autoComplete="off" placeholder="Arun's Model Y" className={field} />
        </label>
        <Button type="submit" disabled={pending} className="h-9">
          {pending ? "Creating…" : "Create invite link"}
        </Button>
      </form>
      <Message result={result} />
      {result?.url && <LinkPanel url={result.url} />}
    </div>
  );
}

// Copy (an unused invite's link again) or New link (an expired one's replacement): the link shows under the row.
export function LinkButton({
  action,
  label,
  pendingLabel,
}: {
  action: (previous: LinkResult, form: FormData) => Promise<LinkResult>;
  label: string;
  pendingLabel: string;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
      </form>
      <Message result={result} />
      {result?.url && (
        <div className="w-[min(22rem,calc(100vw-2.5rem))]">
          <LinkPanel url={result.url} />
        </div>
      )}
    </div>
  );
}
