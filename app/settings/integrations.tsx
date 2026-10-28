"use client";

import { type ReactNode, useRef, useState, useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { FoldToggle } from "@/components/fold-toggle";
import { GrokBotIcon } from "@/components/icons/grok-bot";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOT_INSTRUCTIONS, BOT_NAME, BOT_TEMPLATE_URL, CONNECTOR_INSTRUCTIONS, CONNECTOR_URL } from "@/lib/bot-template";
import { type Connector, CONNECTOR_LIMIT, CONNECTOR_NAME_MAX, connectorName } from "@/lib/connectors";
import { formatAgo, formatDate, formatShortDate } from "@/lib/format";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { addConnector, deleteConnector } from "./actions";
import { useAskingFocus } from "./confirm-actions";
import { Row } from "./row";

// A value to paste somewhere else: selectable text with a copy button beside it.
function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border bg-muted px-2 py-1.5 font-mono text-sm select-all">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

// Steps or text for setting something up by hand, closed until opened. With `copy`, a Copy button sits in
// the closed row, so the text can be copied without opening it (a button inside a summary doesn't toggle it).
function ManualInstructions({ copy, children }: { copy?: string; children: ReactNode }) {
  return (
    <details className="group border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        Manual instructions
        <span className="flex items-center gap-3">
          {copy && <CopyButton text={copy} />}
          <FoldToggle />
        </span>
      </summary>
      <div className="space-y-2 border-t px-3 py-3">{children}</div>
    </details>
  );
}

function countLabel(connectors: Connector[]): string {
  if (connectors.length === 0) return "Not set up";
  return connectors.length === 1 ? "1 connector" : `${connectors.length} connectors`;
}

// "28 Oct", with the year when it isn't this year's.
function createdOn(createdAt: string, now: number): string {
  return new Date(createdAt).getFullYear() === new Date(now).getFullYear() ? formatShortDate(createdAt) : formatDate(createdAt);
}

// One connector: its name, when it was made and last used, and Remove, which asks first.
function ConnectorItem({ connector, now }: { connector: Connector; now: number }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useAskingFocus(asking, first, trigger);
  const used = connector.usedAt ? `Last used ${formatAgo(connector.usedAt, now)}` : "Not used yet";
  const remove = () =>
    start(async () => {
      const failed = await deleteConnector(connector.id);
      setError(failed);
      if (!failed) setAsking(false);
    });

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm">{connector.name}</p>
          <p className="text-sm text-muted-foreground">
            Created {createdOn(connector.createdAt, now)} · {used}
          </p>
        </div>
        {!asking && (
          <Button ref={trigger} type="button" variant="ghost" size="lg" onClick={() => setAsking(true)}>
            Remove
          </Button>
        )}
      </div>
      {asking && (
        <div className="mt-3 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Remove {connector.name}?</p>
          <p className="text-muted-foreground">Its token stops working at once. To connect this AI again, add a new connector.</p>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
            <Button ref={first} type="button" variant="destructive" size="lg" disabled={pending} aria-busy={pending} onClick={remove}>
              {pending ? "Removing…" : "Remove"}
            </Button>
            <Button type="button" variant="ghost" size="lg" disabled={pending} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// Names a new connector. At the limit it says so in place of the form.
function AddConnector({ count, onAdded }: { count: number; onAdded: (added: { name: string; token: string }) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (count >= CONNECTOR_LIMIT) {
    return <p className="text-sm text-muted-foreground">You have {CONNECTOR_LIMIT} connectors, the most you can add. Remove one to add another.</p>;
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!connectorName(name)) return setError(`Give it a name of up to ${CONNECTOR_NAME_MAX} characters.`);
    start(async () => {
      const result = await addConnector(name);
      if ("error" in result) return setError(result.error);
      setError(null);
      setName("");
      onAdded(result);
    });
  };
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...NO_AUTOFILL}
          aria-label="Connector name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "connector-name-error" : undefined}
          placeholder="Claude or Grok"
          maxLength={CONNECTOR_NAME_MAX}
          className="h-9 min-w-0 flex-1 max-sm:h-10"
        />
        <Button type="submit" variant="outline" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? "Adding…" : "Add connector"}
        </Button>
      </div>
      {error && (
        <p id="connector-name-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

// The MCP connectors, one per AI app: the URL they share, a list with Remove on each, and Add connector,
// which shows the new token once. The new token's state lives here, not in the list, so the list
// refreshing after the add doesn't hide it.
export function McpConnector({ connectors, now }: { connectors: Connector[] | null; now: number }) {
  const [added, setAdded] = useState<{ name: string; token: string } | null>(null);

  return (
    <Row title="MCP connectors" control={connectors && <p className="text-sm text-muted-foreground">{countLabel(connectors)}</p>}>
      <div className="mt-4 space-y-4">
        <ManualInstructions copy={CONNECTOR_INSTRUCTIONS}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Add a connector below, named after your AI. Its token is shown once, so keep this page open until it&apos;s saved in your AI.</li>
            <li>In your AI, add a custom MCP connector (in Grok, open Connectors, then New connector, then Custom) with the URL below.</li>
            <li>
              For its authentication, choose a header or API key, and enter the token as <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>. If it asks
              only for an API key, paste the token alone.
            </li>
          </ol>
        </ManualInstructions>
        <Copyable label="Connector URL" value={CONNECTOR_URL} />
        {connectors === null ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load your connectors. Try again in a moment.
          </p>
        ) : (
          <>
            {connectors.length > 0 && (
              <ul className="divide-y border-y">
                {connectors.map((c) => (
                  <ConnectorItem key={c.id} connector={c} now={now} />
                ))}
              </ul>
            )}
            {added && (
              <div className="space-y-3 border-l-2 border-positive pl-4">
                <p className="text-sm font-medium">{added.name} is added</p>
                <Copyable label="Token: paste where it asks for an API key or bearer token" value={added.token} />
                <Copyable label="Or the whole header, where it asks for one" value={`Authorization: Bearer ${added.token}`} />
                <p className="text-sm text-muted-foreground">This token won&apos;t be shown again. Save it in your AI now.</p>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="lg" onClick={() => setAdded(null)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
            <AddConnector count={connectors.length} onAdded={setAdded} />
          </>
        )}
      </div>
    </Row>
  );
}

// The AI bot: one set of instructions for any always-on bot. Grok Bot also gets a one-step button that
// opens the shared template, then a connector's token goes in as its secret; every other bot uses the
// manual instructions.
export function BotTemplate() {
  return (
    <Row
      title={BOT_NAME}
      description="An always-on AI bot that finds charging invoices in Gmail, or in chat, and attaches them to your charges."
      control={
        BOT_TEMPLATE_URL ? (
          <a href={BOT_TEMPLATE_URL} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <GrokBotIcon className="size-4" />
            Add to Grok
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Template coming soon</p>
        )
      }
    >
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {BOT_TEMPLATE_URL && "In Grok Bot, choose Add to Grok, then add a connector above and paste its token. "}
          For any other bot, paste the manual instructions.
        </p>
        <ManualInstructions copy={BOT_INSTRUCTIONS}>
          <pre className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground select-all">{BOT_INSTRUCTIONS}</pre>
        </ManualInstructions>
      </div>
    </Row>
  );
}
