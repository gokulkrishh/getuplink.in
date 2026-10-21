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
