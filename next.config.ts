import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
