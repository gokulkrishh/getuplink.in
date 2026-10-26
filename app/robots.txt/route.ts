import { METADATA_PATHS } from "@/lib/site";
import { requestHost } from "@/lib/session";

// /robots.txt, per host. The home page host lets crawlers read its public pages and nothing else; the app,
// status and demo hosts turn every crawler away, AI ones included. Pages also send noindex (app/layout.tsx)
// and next.config.ts adds an X-Robots-Tag header off the home page, for crawlers that skip this file.
//
// Link previews: Slack, X, Facebook (also WhatsApp's previews) and LinkedIn check this file before reading
// a shared page or its preview image. So every host allows the icons and preview images, and on the
// private hosts those bots may also read the pages people share, like invites. noindex still keeps those
// pages out of search.

const HOME_HOSTS = new Set(["getuplink.in", "www.getuplink.in"]);

const LINK_PREVIEW_BOTS = [
  "Slackbot",
  "Slackbot-LinkExpanding",
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "LinkedInBot",
  "WhatsApp",
  "TelegramBot",
  "Discordbot",
];

const allow = (paths: string[]) => paths.map((path) => `Allow: ${path}`).join("\n");

const HOME = `User-agent: *
Allow: /$
Allow: /privacy
Allow: /terms
Allow: /agents.md
${allow(METADATA_PATHS)}
Disallow: /
`;

const PRIVATE = `${LINK_PREVIEW_BOTS.map((bot) => `User-agent: ${bot}`).join("\n")}
Allow: /$
Allow: /home
Allow: /invite/
Allow: /status
Allow: /privacy
Allow: /terms
${allow(METADATA_PATHS)}
Disallow: /

User-agent: *
${allow(METADATA_PATHS)}
Disallow: /
`;

export function GET(request: Request) {
  const host = requestHost(request.headers)?.split(":")[0] ?? "";
  return new Response(HOME_HOSTS.has(host) ? HOME : PRIVATE, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
