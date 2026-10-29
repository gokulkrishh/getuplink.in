import { HOME_URL } from "@/lib/site";
import { requestHost } from "@/lib/session";

// /sitemap.xml, on the home page host only: the pages search engines may index, the home page and the legal
// pages. The other hosts have nothing to list.

const HOME_HOSTS = new Set(["getuplink.in", "www.getuplink.in"]);
const PAGES = ["/", "/privacy", "/terms"];

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((path) => `  <url><loc>${HOME_URL}${path === "/" ? "/" : path}</loc></url>`).join("\n")}
</urlset>
`;

export function GET(request: Request) {
  const host = requestHost(request.headers)?.split(":")[0] ?? "";
  if (!HOME_HOSTS.has(host)) return new Response("Not found", { status: 404 });
  return new Response(SITEMAP, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
