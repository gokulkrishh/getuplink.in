import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { verifyConnectorToken } from "@/lib/server/connector-token";
import { attachInvoice, chargingSummary, drivingSummary, listChargingSessions } from "@/lib/server/receipts";

// The Uplink MCP connector, for any AI the owner connects (a Grok bot, Claude, ChatGPT). proxy.ts lets
// it through without a session; the token from Settings → Integrations is checked here instead.
// Read tools plus one narrow write: nothing deletes data or reaches the car.

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

// A tool's failure goes back to the AI as an error it can report, not a dropped connection.
async function run(work: () => Promise<unknown>) {
  try {
    return json(await work());
  } catch (err) {
    console.error("MCP tool failed:", messageOf(err));
    return { ...json({ error: "Uplink couldn't do that just now. Try again later." }), isError: true };
  }
}

const time = z.string().describe("ISO date or time. Without an offset it's read as IST, e.g. 2026-10-21T19:10");

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_charging_sessions",
      {
        title: "List charging sessions",
        description:
          "Charging sessions Uplink recorded from the car, newest first: time (IST), AC/DC/Supercharger, kWh added, station, and the invoice if one is attached. Defaults to the last 30 days.",
        inputSchema: z.object({
          from: time.optional(),
          to: time.optional(),
          without_invoice: z.boolean().optional().describe("Only finished non-Supercharger sessions that have no invoice yet"),
        }),
        annotations: { readOnlyHint: true },
      },
      ({ from, to, without_invoice }) => run(() => listChargingSessions({ from, to, withoutInvoice: without_invoice })),
    );

    server.registerTool(
      "attach_charge_invoice",
      {
        title: "Attach a charging invoice",
        description:
          "Saves a third-party charging invoice (any network but Tesla Superchargers) to the session it was for. Uplink finds the session by time, kWh and network, or checks the session_id you pass after the owner picked one. Returns status: attached, already_attached, candidates (ask the owner, then call again with session_id), no_session (retry later), session_has_invoice, or rejected with a reason.",
        inputSchema: z.object({
          network: z.string().min(1).max(80).describe("Charging network as printed, e.g. ChargeMOD, Tata Power EZ Charge"),
          station: z.string().max(160).optional(),
          started_at: time.describe("When charging started, as printed on the invoice"),
          ended_at: time.optional(),
          kwh_billed: z.number().positive().optional(),
          amount_total: z.number().positive().describe("Total paid in ₹, GST included"),
          gst: z.number().min(0).optional(),
          currency: z.string().length(3).optional().describe("INR"),
          invoice_number: z.string().max(80).optional(),
          source_ref: z.string().max(200).optional().describe('Where it came from, so repeats are skipped: "gmail:<message id>" for email'),
          session_id: z.number().int().positive().optional().describe("Only after the owner picked a session from candidates"),
          replace: z.boolean().optional().describe("Replace an existing invoice, only if the owner asked"),
          file_base64: z.string().max(4_300_000).optional().describe("The invoice PDF, PNG or JPEG, base64, up to 3 MB"),
        }),
      },
      (input) => run(() => attachInvoice(input)),
    );

    server.registerTool(
      "get_charging_summary",
      {
        title: "Charging summary",
        description: "Charging spend and energy per month (IST): Superchargers from Tesla's bills, other charging from attached invoices, by network. Counts real bills only.",
        inputSchema: z.object({ months: z.number().int().min(1).max(24).optional().describe("How many months back, this one included. Default 3") }),
        annotations: { readOnlyHint: true },
      },
      ({ months }) => run(() => chargingSummary(months ?? 3)),
    );

    server.registerTool(
      "get_driving_summary",
      {
        title: "Driving summary",
        description: "Distance driven, energy per km and regen for this week, month, year and all time (IST), plus the odometer.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      () => run(() => drivingSummary()),
    );
  },
  { serverInfo: { name: "uplink", version: "1.0.0" } },
);

async function guarded(request: Request): Promise<Response> {
  if (DEMO) return Response.json({ error: "Not available in demo mode" }, { status: 404 });
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
  if (!(await verifyConnectorToken(bearer))) {
    return Response.json(
      { error: "Missing or wrong token. Create one in Uplink → Settings → Integrations." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="uplink"' } },
    );
  }
  return handler(request);
}

export { guarded as DELETE, guarded as GET, guarded as POST };
