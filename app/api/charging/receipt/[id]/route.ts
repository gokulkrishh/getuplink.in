import { connection, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { currentOwner } from "@/lib/server/auth";
import { invoiceFile } from "@/lib/server/receipts";

// Owner-only (proxy.ts requires a session for /api/*). Streams a third-party charging invoice the
// owner's AI attached through the connector, from the private storage bucket.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await invoiceFile(owner, Number(id));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(file.body, { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
}
