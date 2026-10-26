import { requestHost } from "@/lib/session";

// /robots.txt, per host. The home page host lets crawlers read its public pages and nothing else; the app,
// status and demo hosts turn every crawler away, AI ones included. Pages also send noindex (app/layout.tsx)
// and next.config.ts adds an X-Robots-Tag header off the home page, for crawlers that skip this file.

const HOME_HOSTS = new Set(["getuplink.in", "www.getuplink.in"]);

const HOME = `User-agent: *
Allow: /$
Allow: /privacy
Allow: /terms
Allow: /agents.md
Disallow: /
`;

const PRIVATE = `User-agent: *
Disallow: /
`;

export function GET(request: Request) {
  const host = requestHost(request.headers)?.split(":")[0] ?? "";
  return new Response(HOME_HOSTS.has(host) ? HOME : PRIVATE, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
