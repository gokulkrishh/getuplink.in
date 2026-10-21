import { connection, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { hasCurrentSession } from "@/lib/server/auth";
import { fleetGetRaw } from "@/lib/server/tesla";

// Owner-only (proxy.ts requires a session for /api/*). Streams one Supercharger invoice PDF from
// Tesla; the Tesla token never leaves the server.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  if (!(await hasCurrentSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  // Tesla's content ids are letters, digits and dashes; anything else never reaches Tesla.
  if (!/^[\w-]{1,128}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let res: Response;
  try {
    res = await fleetGetRaw(`/api/1/dx/charging/invoice/${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn("Invoice unavailable:", (err as Error).message);
    return NextResponse.json({ error: "Invoice unavailable" }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "Invoice unavailable" }, { status: res.status === 404 ? 404 : 502 });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
