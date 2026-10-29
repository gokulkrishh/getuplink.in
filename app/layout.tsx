import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OPEN_GRAPH, SITE_URL, TAGLINE, TWITTER } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";
import { Suspense } from "react";
import { RowLinks } from "@/components/row-links";
import { TopLoader } from "@/components/top-loader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#040404" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* First stop for the keyboard: hidden until focused, then fixed in the corner so nothing moves. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-foreground"
        >
          Skip to content
        </a>
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
