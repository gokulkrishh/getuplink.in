"use client";

import { useEffect } from "react";
import { preload } from "react-dom";
import { PlainPage } from "@/components/plain-page";
import { Button } from "@/components/ui/button";
import { FONT_PRELOADS } from "@/lib/fonts";
import { THEME_SCRIPT } from "@/lib/theme";
import "./fonts.css";
import "./globals.css";

// Shown when the root layout itself fails, so it brings its own document: the same styles and the same
// theme script as the layout. Next sets no metadata here, hence the title tag.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  for (const href of FONT_PRELOADS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "" });
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
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
