import type { Metadata } from "next";
import { DEMO_SITE, DEMO_URL } from "@/lib/demo";

// Where each part of Uplink lives. Link previews need absolute URLs, so each segment's metadataBase
// points at the host that serves it: the home page on getuplink.in, the status page on its own host,
// and everything else on the app host (or the demo host, for the demo build).
export const HOME_URL = "https://getuplink.in";
export const APP_URL = "https://app.getuplink.in";
export const STATUS_URL = "https://status.getuplink.in";
export const SITE_URL = DEMO_SITE ? DEMO_URL : APP_URL;

export const TAGLINE = "Your Tesla's updates, charging and battery, on one page. Made for India.";

// Metadata merges shallowly: a page that sets openGraph or twitter replaces the parent's whole object,
// so pages spread these in. og:url is left to the pages that have one public address (home, status).
export const OPEN_GRAPH = { type: "website", siteName: "Uplink", locale: "en_IN" } satisfies Metadata["openGraph"];
export const TWITTER = { card: "summary_large_image" } satisfies Metadata["twitter"];

// The dark palette from app/globals.css, for images and the web app manifest.
export const BRAND = {
  background: "#040404",
  foreground: "#f8f8f8",
  muted: "#b4b4b4",
  border: "#1f1f1f",
  accent: "#5f93d6",
} as const;

// Icons, the manifest and link preview images. Every host serves them without a session (proxy.ts), and
// robots.txt lets crawlers fetch them, since chat apps that honour robots.txt skip a preview image it blocks.
export const METADATA_PATHS = [
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
  "/opengraph-image",
  "/twitter-image",
  "/home/opengraph-image",
  "/home/twitter-image",
  "/status/opengraph-image",
  "/status/twitter-image",
  "/invite/opengraph-image",
  "/invite/twitter-image",
];
