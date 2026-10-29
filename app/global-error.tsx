"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { useEffect } from "react";
import { PlainPage } from "@/components/plain-page";
import { Button } from "@/components/ui/button";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Shown when the root layout itself fails, so it brings its own document: the same styles and the same
// theme script as the layout. Next sets no metadata here, hence the title tag.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <title>Couldn&apos;t load Uplink</title>
      </head>
      <body className="flex min-h-full flex-col">
        <main className="flex w-full flex-1 flex-col">
          <PlainPage title="Couldn't load Uplink" intro="Try again in a moment.">
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="lg" onClick={() => retry()}>
                Try again
              </Button>
            </div>
          </PlainPage>
        </main>
      </body>
    </html>
  );
}
