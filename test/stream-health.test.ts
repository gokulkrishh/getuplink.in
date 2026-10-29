import { describe, expect, test } from "bun:test";
import { streamingToRecord, streamPart } from "@/lib/stream-health";

// The status page's "Live car data" says whether Uplink's side works: the receiver, Tesla's API, the
// database, and data arriving while cars are awake. One owner's car (its key, its config, its expiry) is
// that owner's, shown in their bell, never here.

const fine = { freshness: { stale: false, hours: 0 }, freshnessError: null, teslaError: null, streamErrors: [] };

describe("streamPart", () => {
  test("operational when data arrives and Tesla answers", () => {
    expect(streamPart(fine)).toEqual({ status: "operational", problems: [] });
  });

  test("no data while cars were awake is down", () => {
    expect(streamPart({ ...fine, freshness: { stale: true, hours: 3.5 } })).toEqual({ status: "down", problems: ["No streamed data for 3.5 h while cars were awake"] });
  });

  test("Tesla's API failing, receiver errors Tesla reports, or a failed read of our own data degrade it", () => {
    expect(streamPart({ ...fine, teslaError: "Tesla API 503" })).toEqual({ status: "degraded", problems: ["Couldn't check the Tesla config: Tesla API 503"] });
    expect(streamPart({ ...fine, streamErrors: ["tls_handshake", "cert_expired", "third"] })).toEqual({
      status: "degraded",
      problems: ["Tesla reported a stream error (tls_handshake, cert_expired) and no data has arrived since"],
    });
    expect(streamPart({ ...fine, freshness: null, freshnessError: "timed out" })).toEqual({ status: "degraded", problems: ["Couldn't check stream freshness: timed out"] });
  });

  test("the worst wins and every problem is listed", () => {
    const part = streamPart({ ...fine, freshness: { stale: true, hours: 2 }, teslaError: "x" });
    expect(part.status).toBe("down");
    expect(part.problems).toHaveLength(2);
  });
});

// The health check's fresh word on a car's config, kept on its row when it differs from what the row
// says, so /setup and the 6-hourly check act on it (a lost config is sent again) without waiting a day.
describe("streamingToRecord", () => {
  test("a different state Tesla said is kept", () => {
    expect(streamingToRecord("synced", "none")).toBe("none");
    expect(streamingToRecord(null, "synced")).toBe("synced");
    expect(streamingToRecord("pending", "synced")).toBe("synced");
  });

  test("the same state isn't written again (that would put off the daily reread), nor an answer not understood", () => {
    expect(streamingToRecord("synced", "synced")).toBeNull();
    expect(streamingToRecord("synced", null)).toBeNull();
  });

  test("nothing when the row isn't known (before the setup migration, or no row)", () => {
    expect(streamingToRecord(undefined, "none")).toBeNull();
  });
});
