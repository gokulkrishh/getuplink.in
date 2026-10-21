"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IMPORT_MAX_CHARS, type ImportState } from "@/lib/import-updates";
import { importUpdates } from "./actions";
import { Row } from "./row";

const IDLE: ImportState = { status: "idle", message: null, issues: [], count: 0 };

function Buttons({ canImport, count }: { canImport: boolean; count: number }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <Button type="submit" name="intent" value="preview" variant="outline" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Check"}
      </Button>
      {canImport && (
        <Button type="submit" name="intent" value="import" size="lg" disabled={pending}>
          Import {count} {count === 1 ? "update" : "updates"}
        </Button>
      )}
    </div>
  );
}

// One car: paste lines or load a CSV, check them, then confirm. The server checks again before saving.
export function ImportUpdates({ vehicleId, name, imported }: { vehicleId: string; name: string; imported: number }) {
  const [state, action] = useActionState(importUpdates, IDLE);
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (imported > 0) {
    return (
      <Row
        title={name}
        description={`${imported} imported ${imported === 1 ? "update" : "updates"}. Delete them below to import a new list.`}
      >
        {state.status === "done" && (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {state.message}
          </p>
        )}
      </Row>
    );
  }

  async function loadFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_CHARS) {
      setFileError("That file is too large. Use the export that lists software updates.");
    } else {
      setText(await file.text());
    }
    // So choosing the same file again still fires.
    if (fileInput.current) fileInput.current.value = "";
  }

  const preview = state.status === "preview" && checkedText === text;
  return (
    <Row
      title={name}
      description="One update per line: version, the date it was installed, and optionally the odometer in km."
    >
      <form action={action} onSubmit={() => setCheckedText(text)} className="mt-4 space-y-3 text-sm">
        <input type="hidden" name="vehicle" value={vehicleId} />
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted-foreground">Updates</span>
          <textarea
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            placeholder={"2026.20.5 2026-06-14\n2026.14.3 2026-05-02 18400"}
            className="min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted-foreground">Or a CSV file, like TeslaFi&apos;s software updates export</span>
          <Input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
        {fileError && (
          <p role="alert" className="text-xs text-destructive">
            {fileError}
          </p>
        )}
        <Buttons canImport={preview} count={state.count} />
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {state.message}
          </p>
        )}
        {state.issues.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </form>
    </Row>
  );
}
