import { createMcpHandler } from "mcp-handler";
import { revalidateTag } from "next/cache";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { z } from "zod";
import { DEMO } from "@/lib/demo";
import { HOME_URL } from "@/lib/site";
import { detailsInput } from "@/lib/invoice-details";
import { lineItemsInput } from "@/lib/invoice-items";
import { messageOf } from "@/lib/errors";
import { isoDay } from "@/lib/periods";
import type { Owner } from "@/lib/server/auth";
import { verifyConnectorToken } from "@/lib/server/connector-token";
import { batteryStatus, carNowStatus, chargingInsights, daySummary, drivingInsights, getTrip, listTrips, monthlySummary } from "@/lib/server/mcp-data";
import { parseInvoiceTime, parseRangeEnd } from "@/lib/mcp-ranges";
import { ownerComparisons } from "@/lib/server/owners";
import { attachInvoice, chargingSummary, drivingSummary, listChargingSessions } from "@/lib/server/receipts";

// The Uplink MCP connector, for any AI the owner connects (a Grok bot, Claude, ChatGPT). proxy.ts lets
// it through without a session; a connector's token from Settings → Connect your AI is checked here instead.
// Read tools for everything the app shows, plus one narrow write: nothing deletes data or reaches the car.

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

// A tool's failure goes back to the AI as an error it can report, not a dropped connection.
async function run(work: () => Promise<unknown>) {
  try {
    return json(await work());
  } catch (err) {
    console.error("MCP tool failed:", messageOf(err));
    return { ...json({ error: "Uplink couldn't do that. Try again in a moment." }), isError: true };
  }
}

const time = z.string().describe("ISO date or time. Without an offset it's read as IST, e.g. 2026-10-21T19:10");

// The title and icon an AI app shows beside the connector; without icons it draws a letter. A plain const:
// mcp-handler types serverInfo as name and version only, but hands the whole object to the SDK's server.
const SERVER_INFO = {
  name: "uplink",
  title: "Uplink",
  version: "1.0.0",
  websiteUrl: HOME_URL,
  // As til.bar sends it, where AI apps show its logo: one SVG at any size, from the home site.
  icons: [{ src: `${HOME_URL}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
};

// The tools, bound to the account the token belongs to: every read and write is that account's. The
// handler builds a new server per request anyway (stateless), so binding per request costs nothing.
const handlerFor = (owner: Owner) =>
  createMcpHandler(
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
      ({ from, to, without_invoice }) => run(() => listChargingSessions(owner, { from, to, withoutInvoice: without_invoice })),
    );

    server.registerTool(
      "attach_charge_invoice",
      {
        title: "Attach a charging invoice",
        description:
          "Saves a third-party charging invoice (any network but Tesla Superchargers) to the session it was for. Uplink finds the session by time, kWh and network, or checks the session_id you pass after the owner picked one. Returns status: attached, replaced (replace: true saved over the session's invoice), already_attached, candidates (ask the owner, then call again with session_id), no_session (retry later), session_has_invoice, or rejected with a reason. With line_items, `lines` says whether they were saved; lines that don't add up to amount_total aren't, and the invoice is saved without them. To add lines to an invoice already attached, send the same invoice again with them.",
        inputSchema: z.object({
          network: z.string().min(1).max(80).describe("Charging network as printed, e.g. ChargeMOD, Tata Power EZ Charge"),
          station: z.string().max(160).optional(),
          started_at: time.describe("When charging started, as printed on the invoice"),
          ended_at: time.optional(),
          kwh_billed: z.number().positive().optional(),
          amount_total: z.number().positive().describe("Total paid in ₹, GST included"),
          gst: z.number().min(0).optional(),
          energy_amount: z.number().positive().optional().describe("Older field: the energy charge in ₹ before GST. Send line_items instead"),
          currency: z.string().length(3).optional().describe("INR"),
          invoice_number: z.string().max(80).optional(),
          source_ref: z.string().max(200).optional().describe('Where it came from, so repeats are skipped: "gmail:<message id>" for email'),
          session_id: z.number().int().positive().optional().describe("Only after the owner picked a session from candidates"),
          replace: z.boolean().optional().describe("Replace an existing invoice, only if the owner asked"),
          file_base64: z.string().max(4_300_000).optional().describe("The invoice PDF, PNG or JPEG, base64, up to 3 MB"),
          line_items: lineItemsInput.optional(),
          details: detailsInput.optional(),
        }),
      },
      // A saved invoice shows on the owner's pages at once, not when their cached copy expires.
      (input) =>
        run(async () => {
          const result = await attachInvoice(owner, input);
          if (["attached", "replaced", "already_attached"].includes(String(result.status))) revalidateTag(OWNER_DATA_TAG, { expire: 0 });
          return result;
        }),
    );

    server.registerTool(
      "get_charging_summary",
      {
        title: "Charging summary",
        description: "Charging spend and energy per month (IST): Superchargers from Tesla's bills, other charging from attached invoices, by network. Counts real bills only.",
        inputSchema: z.object({ months: z.number().int().min(1).max(24).optional().describe("How many months back, this one included. Default 3") }),
        annotations: { readOnlyHint: true },
      },
      ({ months }) => run(() => chargingSummary(owner, months ?? 3)),
    );

    server.registerTool(
      "get_driving_summary",
      {
        title: "Driving summary",
        description: "Distance driven, energy per km and regen for this week, month, year and all time (IST), plus the odometer.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      () => run(() => drivingSummary(owner)),
    );

    const ro = { readOnlyHint: true } as const;
    const DAY = 86_400_000;
    server.registerTool(
      "list_trips",
      {
        title: "List trips",
        description: "Trips in a date range (default the last 7 days), newest first. A trip is drives with stops under an hour between them; each has its legs. Use trip_id with get_trip.",
        inputSchema: z.object({ from: time.optional(), to: time.optional() }),
        annotations: ro,
      },
      ({ from, to }) =>
        run(() => {
          // A date alone takes in that whole day; a time ends there.
          const end = to ? parseRangeEnd(to) : Date.now() + DAY;
          return listTrips(owner, from ? parseInvoiceTime(from) : Date.now() - 7 * DAY, end);
        }),
    );
    server.registerTool(
      "get_trip",
      {
        title: "Get a trip",
        description:
          "One trip in detail: distance, driving and stopped time, energy, battery, range used, average and top speed, outside temperature, most power and regen, strongest acceleration and hardest braking, grade, each leg and the stops, and its start, stop and end places. Pass leg: true with a drive_id for one leg alone.",
        inputSchema: z.object({ trip_id: z.number().int().positive(), leg: z.boolean().optional() }),
        annotations: ro,
      },
      ({ trip_id, leg }) => run(() => getTrip(owner, trip_id, leg ?? false)),
    );
    server.registerTool(
      "get_day",
      {
        title: "Get a day",
        description: "One day (IST): a timeline of driving, charging, parked and asleep, with that day's trips and charges.",
        // A real date only: "2026-02-30" would roll over to 2 March.
        inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => isoDay(d) !== null, "date must be a real date like 2026-10-23").describe("YYYY-MM-DD, e.g. 2026-10-23") }),
        annotations: ro,
      },
      ({ date }) => run(() => daySummary(owner, date)),
    );
    server.registerTool(
      "get_battery_status",
      {
        title: "Battery status",
        description: "Charge level, usable capacity and range at 100% against the best week, Tesla's own full-pack figure with when it was reported, AC and DC charging efficiency, parked now and parked drain (kW, % and km a day), battery, inside and outside temperature, and the cell voltage gap.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => batteryStatus(owner)),
    );
    server.registerTool(
      "get_car_now",
      {
        title: "Car now",
        description: "The car's state from its latest readings: locked, Sentry Mode, doors, windows, charge port, climate, cabin overheat protection, temperatures, and each tyre's pressure in psi with when it was measured and which tyre is low.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => carNowStatus(owner)),
    );
    server.registerTool(
      "get_monthly_summary",
      {
        title: "Monthly summary",
        description: "Month by month: km driven, time driving, kWh used, charges, kWh added and spend from real bills, with how many charges had no bill.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => monthlySummary(owner)),
    );
    server.registerTool(
      "get_charging_insights",
      {
        title: "Charging insights",
        description: "Top stations by energy with spend, the typical start and end battery level, hours on AC and DC, and recent DC charges' peak and average power.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => chargingInsights(owner)),
    );
    server.registerTool(
      "get_driving_insights",
      {
        title: "Driving insights",
        description: "Last 30 days: share of time at each speed, km per kWh by outside temperature and by speed, and the places the car parks (by your own name for them, else a station or area name, with the car's Home, Work or Favourite as car_tag) with visits and hours parked.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => drivingInsights(owner)),
    );
    server.registerTool(
      "get_owner_comparisons",
      {
        title: "Compare with other owners",
        description:
          "How the owner's Tesla compares with other Uplink owners in India, and how many Uplink cars are in each Indian state. Answers questions like \"is my energy use normal for my model?\", \"how full do owners charge?\", \"how many owners use Sentry Mode?\", \"when do owners plug in?\" and \"how many cars are there in Tamil Nadu?\". Figures are for the last 30 days, worked out daily at 3:30 AM India time, and are totals from owners who share their figures: each across at least 5 cars, never one car's values. Each figure names who it's for (all owners who share, owners of the same model, battery and drive, or of the same battery type) and, in the owner's own group, gives their own figure and whether it's lower than most, about the middle or higher than most. State counts are Uplink's own cars, not all Teslas in India, for every state with a car, as on the Rollout page. Works only when the owner shares: otherwise it returns no figures and says to turn on Share with other owners in Settings.",
        inputSchema: z.object({}),
        annotations: ro,
      },
      () => run(() => ownerComparisons(owner, Date.now())),
    );
  },
  { serverInfo: SERVER_INFO },
);

async function guarded(request: Request): Promise<Response> {
  if (DEMO) return Response.json({ error: "Not available in demo mode" }, { status: 404 });
  // "Bearer upl_…" as the standard sends it, or the bare token, as some apps send an API key.
  const header = request.headers.get("authorization")?.trim() ?? "";
  const bearer = (header.match(/^Bearer\s+(.+)$/i)?.[1] ?? header).trim() || null;
  const owner = await verifyConnectorToken(bearer);
  if (!owner) {
    return Response.json(
      { error: "Missing or wrong token. Add a connector in Uplink, under Settings, Connect your AI." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="uplink"' } },
    );
  }
  return handlerFor(owner)(request);
}

export { guarded as DELETE, guarded as GET, guarded as POST };
