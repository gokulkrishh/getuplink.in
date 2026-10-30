import type { Metadata, Viewport } from "next";
import { OPEN_GRAPH, SITE_URL, TAGLINE, TWITTER } from "@/lib/site";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import { GUEST_SCRIPT } from "@/lib/view-links";
import { Suspense } from "react";
import { RowLinks } from "@/components/row-links";
import { SkipLink } from "@/components/skip-link";
import { TopLoader } from "@/components/top-loader";
import { preloadFonts } from "@/lib/fonts";
import "./fonts.css";
import "./globals.css";

// The app, demo and invite pages stay out of search (noindex) but still carry Open Graph tags, so a link
// shared in Slack, WhatsApp, X, LinkedIn or iMessage shows a card. Icons and the preview images come from
// the file conventions: icon.svg, apple-icon.png, manifest.ts and opengraph-image.tsx. favicon.ico is a
// plain file in public/, linked here without a version query: Google's favicon service, which AI apps use
// for a connector's logo, finds it there (as til.bar does).
// The home and status pages set their own metadataBase, og:url and image.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Uplink", template: "%s · Uplink" },
  description: TAGLINE,
  applicationName: "Uplink",
  appleWebApp: { title: "Uplink" },
  // Set here, the icons replace the file conventions' links, so all three are named.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
  openGraph: { ...OPEN_GRAPH, title: "Uplink", description: TAGLINE },
  twitter: { ...TWITTER, title: "Uplink", description: TAGLINE },
};

// cover: the page runs edge to edge under the notch and home bar, and fixed parts pad themselves back with
// env(safe-area-inset-*), which is 0 without it. resizes-content: on Android the keyboard shrinks the page,
// as on iOS, so a sheet's dvh height and its bottom buttons stay above the keyboard.
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Geist and Geist Mono are cut down to what the app uses (scripts/subset-fonts.py, docs/fonts.md). Every page
  // preloads each one's core file; an extended file loads only on a page with one of its characters.
  preloadFonts();
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Static, like the theme script: on a guest's browser it makes room for the guest pill before the
            first paint, so the page doesn't move when the pill streams in (see lib/view-links.ts). */}
        <script dangerouslySetInnerHTML={{ __html: GUEST_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* First stop for the keyboard: hidden until focused, then fixed in the corner so nothing moves. */}
        <SkipLink />
        {/* Reads the address, so it waits behind Suspense and never holds up a page's static shell. */}
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        <main id="content" tabIndex={-1} className="flex w-full flex-1 flex-col focus:outline-none">{children}</main>
        <RowLinks />
      </body>
    </html>
  );
}
