"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { FORMAT_LABELS, type ImportState, MAX_IMPORT_BYTES, type PreviewRow, type RowStatus } from "@/lib/import-updates";
import { cn } from "@/lib/utils";
import { importUpdates } from "./import-actions";
import { Row } from "./row";

const IDLE: ImportState = { status: "idle" };
const plural = (n: number) => `${n} ${n === 1 ? "update" : "updates"}`;
const SKIPPED: Record<Exclude<RowStatus, "new">, string> = {
  duplicate: "Already in history",
  newer: "After tracking began",
};

function Submit({
  children,
  pendingLabel,
  intent,
  variant = "outline",
  ref,
}: {
  children: string;
  pendingLabel: string;
  intent: string;
  variant?: "outline" | "default" | "destructive";
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();
  return (
    <Button ref={ref} type="submit" name="intent" value={intent} variant={variant} size="lg" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function Message({ state }: { state: ImportState }) {
  if (state.status === "done") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {state.message}
      </p>
    );
  }
  if (state.status !== "error") return null;
  return (
    <div role="alert" className="space-y-1 text-xs">
      <p className="text-destructive">{state.message}</p>
      <Issues issues={state.issues} />
    </div>
  );
}

function Issues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

// Version, date and source for every update found; skipped ones are greyed with the reason.
function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-faint">
            <th className="pb-2 font-medium">Version</th>
            <th className="pb-2 text-right font-medium">Date</th>
            <th className="pb-2 text-right font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.version} className={cn("border-t", row.status !== "new" && "text-faint")}>
              <td className="py-2 font-mono">
                {row.version}
                {row.status !== "new" && <span className="ml-2 font-sans text-xs">{SKIPPED[row.status]}</span>}
              </td>
              <td className={cn("py-2 text-right tabular-nums", row.status === "new" && "text-muted-foreground")}>{formatDate(row.at)}</td>
              <td className="py-2 text-right text-faint">{FORMAT_LABELS[row.format]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Choose an export or type the list, check it, then confirm. The server checks the rows again before saving.
export function ImportUpdates() {
  const [state, action] = useActionState(importUpdates, IDLE);
  // Controlled, so the typed list survives the form reset after each check.
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const preview = state.status === "preview" ? state.rows : null;
  const fresh = preview?.filter((r) => r.status === "new") ?? [];
  const skipped = (preview?.length ?? 0) - fresh.length;

  return (
    <Row
      title="Import past updates"
      description="Add the updates from before Uplink, so your history starts at delivery. Imported updates won't have install times."
    >
      <form
        action={action}
        onSubmit={(e) => {
          const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
          if (file && file.size > MAX_IMPORT_BYTES) {
            e.preventDefault();
            setFileError("That's larger than 2 MB. Export a shorter date range.");
          } else setFileError(null);
        }}
        className="mt-4 space-y-3 text-sm"
      >
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted-foreground">TeslaFi or TeslaMate export, CSV or JSON, up to 2 MB</span>
          <Input name="file" type="file" accept=".csv,.json,text/csv,application/json" />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted-foreground">Or type one version and date per line</span>
          <textarea
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder={"2025.20.6 2025-06-25\n2025.14.3 2025-04-20"}
            className="min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </label>
        {fileError && (
          <p role="alert" className="text-xs text-destructive">
            {fileError}
          </p>
        )}
        <Submit intent="check" pendingLabel="Checking…">
          Check
        </Submit>
        {!preview && <Message state={state} />}
      </form>

      {preview && (
        <form action={action} className="mt-6 space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {fresh.length > 0 ? `${plural(fresh.length)} to import` : "Nothing new to import"}
            {skipped > 0 && `, ${skipped} skipped`}.
          </p>
          <PreviewTable rows={preview} />
          {state.status === "preview" && <Issues issues={state.issues} />}
          <input type="hidden" name="rows" value={JSON.stringify(fresh)} />
          <div className="flex gap-2 pt-1">
            {fresh.length > 0 && (
              <Submit intent="import" variant="default" pendingLabel="Importing…">
                {`Import ${plural(fresh.length)}`}
              </Submit>
            )}
            <Button type="submit" name="intent" value="cancel" variant="ghost" size="lg">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}

// Removes every imported update; tracked ones stay. Two steps, like the other destructive settings.
export function UndoImport({ count }: { count: number }) {
  const [asking, setAsking] = useState(false);
  const [state, action] = useActionState(importUpdates, IDLE);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  // Focus moves into the confirmation, and back to Remove on cancel.
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) confirm.current?.focus();
    else if (wasAsking.current) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (count === 0) {
    return state.status === "done" ? <Row title="Imported updates" description={state.message} /> : null;
  }
  return (
    <Row
      title="Imported updates"
      description={`${plural(count)} imported. Tracked updates aren't affected.`}
      control={
        !asking ? (
          <Button ref={trigger} type="button" variant="outline" size="lg" onClick={() => setAsking(true)}>
            Remove
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Remove {plural(count)}?</p>
          <p className="text-muted-foreground">Your history will start from when Uplink began tracking. You can import them again later.</p>
          <Message state={state} />
          <div className="flex gap-2 pt-1">
            <Submit ref={confirm} intent="undo" variant="destructive" pendingLabel="Removing…">
              Remove imported updates
            </Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}
