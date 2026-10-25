import { describe, expect, test } from "bun:test";
import { parseReleaseNotes } from "@/lib/release-notes";

const SECURITY = { title: "Security Improvements", description: "This update includes important security fixes and improvements." };
const item = (title: string, customer_version: string, description = `${title} notes`) => ({ title, description, customer_version });

describe("parseReleaseNotes", () => {
  test("2026.38.3.2 keeps its own notes and its family's, once each", () => {
    // Tesla's real response for 2026.38.3.2: every item since 2026.32, each tagged with its version.
    const notes = parseReleaseNotes({
      release_notes_version: "2026.38.3.2",
      release_notes: [
        { ...SECURITY, customer_version: "2026.38.3.2" },
        item("Halloween Mode", "2026.38.3.1"),
        { ...SECURITY, customer_version: "2026.38.3.1" },
        { ...SECURITY, customer_version: "2026.38" },
        { ...SECURITY, customer_version: "2026.32.3" },
        item("Wheel Selection", "2026.32"),
        item("Apple Music", "2026.32"),
        { ...SECURITY, customer_version: "2026.32" },
      ],
    });
    expect(notes).toEqual([{ title: SECURITY.title, subtitle: undefined, description: SECURITY.description }]);
  });

  test("a version is matched by whole segments, so 2026.2's notes stay out of 2026.20.1", () => {
    const notes = parseReleaseNotes({
      release_notes_version: "2026.20.1",
      release_notes: [item("Twenty", "2026.20"), item("Two", "2026.2"), item("Twenty one", "2026.20.1"), item("Twenty point one", "2026.20.10")],
    });
    expect(notes.map((n) => n.title)).toEqual(["Twenty", "Twenty one"]);
  });

  test("untagged items and a response without a version keep everything with a title", () => {
    expect(parseReleaseNotes({ release_notes: [item("Tagged", "2026.2"), { title: "Untagged" }, { title: " " }] }).map((n) => n.title)).toEqual([
      "Tagged",
      "Untagged",
    ]);
    expect(parseReleaseNotes(null)).toEqual([]);
  });
});
