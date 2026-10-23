"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { GrokIcon } from "@/components/icons/grok";
import { Button, buttonVariants } from "@/components/ui/button";
import { BOT_CHAT, BOT_NAME, BOT_ROUTINE, BOT_TEMPLATE_URL, CONNECTOR_URL } from "@/lib/bot-template";
import { formatAgo, formatDate } from "@/lib/format";
import type { ConnectorTokenStatus } from "@/lib/server/connector-token";
import { newConnectorToken, removeConnectorToken } from "./actions";
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

// An instruction to paste into the bot, folded away until wanted.
function Instruction({ title, text }: { title: string; text: string }) {
  return (
    <details className="group border">
      <summary className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
        {title}
        <span className="text-sm text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-sm text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="space-y-2 border-t px-3 py-3">
        <pre className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground select-all">{text}</pre>
        <div className="flex justify-end">
          <CopyButton text={text} />
        </div>
      </div>
    </details>
  );
}

function tokenSummary(status: ConnectorTokenStatus, now: number): string {
  if (!status) return "Not set up";
  return status.usedAt ? `Connected · used ${formatAgo(status.usedAt, now)}` : `Token created ${formatDate(status.createdAt)} · not used yet`;
}

// The MCP connector any AI can use: its URL and a token created here, shown once.
export function McpConnector({ status, now }: { status: ConnectorTokenStatus; now: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (action: () => Promise<{ token: string | null; error: string | null }>) =>
    start(async () => {
      const result = await action();
      setToken(result.token);
      setError(result.error);
    });

  return (
    <Row
      title="MCP connector"
      description="Lets an AI you use, like a Grok bot, Claude or ChatGPT, read your charging and driving and attach charging invoices. It can't delete anything or reach your car."
      control={<p className="text-sm text-muted-foreground">{tokenSummary(status, now)}</p>}
    >
      <div className="mt-4 space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Create a token below. It&apos;s shown once, so keep this page open until it&apos;s saved in your AI.</li>
          <li>In your AI, add a custom MCP connector (in Grok, open Connectors, then New connector, then Custom) with the URL below.</li>
          <li>
            For its authentication, choose a header or API key, and enter the token as <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>. If it asks
            only for an API key, paste the token alone.
          </li>
        </ol>
        <Copyable label="Connector URL" value={CONNECTOR_URL} />
        {token && (
          <div className="space-y-3">
            <Copyable label="Token: paste where it asks for an API key or bearer token" value={token} />
            <Copyable label="Or the whole header, where it asks for one" value={`Authorization: Bearer ${token}`} />
            <p className="text-sm text-muted-foreground">Shown once. Replace token makes a new one and stops the old one.</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {status && (
            <Button type="button" variant="ghost" size="lg" disabled={pending} onClick={() => act(removeConnectorToken)}>
              Revoke token
            </Button>
          )}
          <Button type="button" variant="outline" size="lg" disabled={pending} aria-busy={pending} onClick={() => act(newConnectorToken)}>
            {pending ? "Working…" : status ? "Replace token" : "Create token"}
          </Button>
        </div>
      </div>
    </Row>
  );
}

// The Grok bot: one button that opens the shared template in Grok, then the connector token goes in as
// its secret. The manual setup stays folded away as a fallback, and is all there is until the template
// link is published.
export function GrokBotTemplate() {
  return (
    <Row
      title={BOT_NAME}
      description="A Grok bot that finds your charging invoices in Gmail every 6 hours, and takes ones you share with it in chat, and attaches them to your charges."
      control={
        BOT_TEMPLATE_URL ? (
          <a href={BOT_TEMPLATE_URL} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <GrokIcon className="size-4" />
            Add to Grok
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Template coming soon</p>
        )
      }
    >
      <div className="mt-4 space-y-3">
        {BOT_TEMPLATE_URL && <p className="text-sm text-muted-foreground">After adding it, paste the connector token above into the bot&apos;s Uplink connector.</p>}
        <details className="group border">
          <summary className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            Set up by hand
            <span className="text-sm text-muted-foreground group-open:hidden">Show</span>
            <span className="hidden text-sm text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="space-y-4 border-t px-3 py-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Create a Grok bot named {BOT_NAME} and connect your Gmail to it.</li>
              <li>Add the MCP connector above to it: the URL, and the token as a secret.</li>
              <li>Add a routine that runs every 6 hours with the first instruction below.</li>
              <li>Give the bot the second instruction for invoices you send it in chat.</li>
            </ol>
            <Copyable label="Bot name" value={BOT_NAME} />
            <Instruction title="Routine, every 6 hours" text={BOT_ROUTINE} />
            <Instruction title="In chat" text={BOT_CHAT} />
          </div>
        </details>
      </div>
    </Row>
  );
}
