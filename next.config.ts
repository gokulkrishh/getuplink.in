import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Reuse a page's data for 60s when navigating back to it, so the header links don't flash a skeleton.
  experimental: {
    staleTimes: { dynamic: 60 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Nothing off the home page is for search engines or AI crawlers: the app, status and demo hosts, and
  // /admin and /api anywhere. Pages also carry noindex metadata and robots.txt turns crawlers away; this
  // header covers crawlers that skip both.
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" }];
    return [
      ...["app.getuplink.in", "status.getuplink.in", "demo.getuplink.in"].map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        headers: noindex,
      })),
      { source: "/admin/:path*", headers: noindex },
      { source: "/admin", headers: noindex },
      { source: "/api/:path*", headers: noindex },
      { source: "/settings", headers: noindex },
      { source: "/waitlist", headers: noindex },
      // An invite's token is in its path: never indexed, and never sent on in a Referer.
      { source: "/invite/:path*", headers: [...noindex, { key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Tesla fetches the partner public key from this fixed path.
  async rewrites() {
    return [
      {
        source: "/.well-known/appspecific/com.tesla.3p.public-key.pem",
        destination: "/api/public-key",
      },
    ];
  },
};

export default nextConfig;
