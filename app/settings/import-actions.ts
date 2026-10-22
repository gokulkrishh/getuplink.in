"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { messageOf } from "@/lib/errors";
import { type ImportState, MAX_IMPORT_BYTES } from "@/lib/import-updates";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { previewImport, saveImport, undoImport } from "@/lib/server/import-updates";

const TOO_LARGE = "That's larger than 2 MB. Export a shorter date range.";

// One action for the import form: "check" previews, "import" saves what was previewed, "undo" removes
// imported rows, "cancel" clears the preview. Server actions are reachable by POST from anywhere, so it
// re-checks the session.
export async function importUpdates(_: ImportState, form: FormData): Promise<ImportState> {
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const intent = form.get("intent");
  try {
    if (intent === "check") {
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_IMPORT_BYTES) return { status: "error", message: TOO_LARGE, issues: [] };
        return await previewImport(await file.text(), { pasted: false });
      }
      const text = String(form.get("text") ?? "");
      if (!text.trim()) return { status: "error", message: "Choose a file or type your updates first.", issues: [] };
      if (text.length > MAX_IMPORT_BYTES) return { status: "error", message: TOO_LARGE, issues: [] };
      return await previewImport(text, { pasted: true });
    }
    if (intent === "import" || intent === "undo") {
      const result = intent === "import" ? await saveImport(String(form.get("rows") ?? "")) : await undoImport();
      // The dashboard and Stats are cached per owner; drop those copies so they show the change.
      if (result.status === "done") updateTag(OWNER_DATA_TAG);
      return result;
    }
    return { status: "idle" };
  } catch (err) {
    console.error("Import failed:", messageOf(err));
    return { status: "error", message: "Couldn't import. Try again in a moment.", issues: [] };
  }
}
