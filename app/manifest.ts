import type { MetadataRoute } from "next";
import { BRAND, TAGLINE } from "@/lib/site";

// Served at /manifest.webmanifest on every host. The PNGs come from scripts/build-icon.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Uplink",
    short_name: "Uplink",
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.background,
    theme_color: BRAND.background,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
