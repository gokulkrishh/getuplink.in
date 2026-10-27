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
  // The day page is gone: a day opens on Stats > Driving as a one-day Custom range. Old links land there.
  async redirects() {
    return [{ source: "/stats/day/:date(\\d{4}-\\d{2}-\\d{2})", destination: "/stats/driving?period=custom&from=:date&to=:date", permanent: true }];
  },
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" }];
    // On every page: no other site may frame Uplink, browsers don't guess file types, links to other sites
    // carry only the origin, HTTPS always, and no camera or microphone, and location only for the map's own button.
    const security = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
    ];
    return [
      { source: "/:path*", headers: security },
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
