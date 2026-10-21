import { connection } from "next/server";
import { pem } from "@/lib/server/env";

// Served at /.well-known/appspecific/com.tesla.3p.public-key.pem (see next.config.ts).
export async function GET() {
  await connection();
  const key = process.env.TESLA_PUBLIC_KEY_PEM;
  if (!key) return new Response("Public key not configured", { status: 404 });
  return new Response(pem(key).trim() + "\n", {
    headers: { "Content-Type": "application/x-pem-file", "Cache-Control": "public, max-age=3600" },
  });
}
