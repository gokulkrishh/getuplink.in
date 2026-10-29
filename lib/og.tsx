import { ImageResponse } from "next/og";
import { LOGO_PATH } from "@/lib/logo";
import { BRAND } from "@/lib/site";

// The link preview card: logo and name, a headline, one plain line, and the address it came from.
// Rendered by next/og (Geist Regular is its built-in font), at the 1200×630 size every chat app crops to.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

type Card = {
  headline: string;
  line: string;
  host: string;
  // A small label beside the name, e.g. "Status".
  tag?: string;
};

export function ogImage({ headline, line, host, tag }: Card): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: BRAND.background,
          backgroundImage: `radial-gradient(circle at 100% 0%, ${BRAND.accent}40 0%, ${BRAND.accent}00 55%)`,
          color: BRAND.foreground,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 22,
              border: `2px solid ${BRAND.border}`,
              backgroundColor: "#111111",
            }}
          >
            <svg width="60" height="60" viewBox="0 0 32 32">
              <path d={LOGO_PATH} fill="none" stroke={BRAND.foreground} strokeWidth="3" strokeLinecap="square" />
            </svg>
          </div>
          <div style={{ fontSize: 52, letterSpacing: -1 }}>Uplink</div>
          {tag ? (
            <div
              style={{
                display: "flex",
                marginLeft: 8,
                padding: "6px 18px",
                borderRadius: 999,
                border: `2px solid ${BRAND.border}`,
                color: BRAND.muted,
                fontSize: 28,
              }}
            >
              {tag}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1000 }}>{headline}</div>
          <div style={{ fontSize: 36, lineHeight: 1.3, color: BRAND.muted, maxWidth: 960 }}>{line}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: BRAND.muted }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: BRAND.accent }} />
          {host}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

// The cards for each part of Uplink. The opengraph-image and twitter-image routes render the same one.
export const CARDS = {
  home: {
    alt: "Uplink: your Tesla's updates, charging and battery, on one page. Made for India.",
    card: { headline: "Your Tesla's updates, charging and battery, on one page.", line: "Made for India. Read-only.", host: "getuplink.in" },
  },
  app: {
    alt: "Uplink: your Tesla's updates, charging and battery, on one page.",
    card: { headline: "Your Tesla's updates, charging and battery, on one page.", line: "Made for India. Read-only.", host: "app.getuplink.in" },
  },
  demo: {
    alt: "Uplink demo: a sample car's updates, charging and battery.",
    card: { headline: "See Uplink with a sample car.", line: "Updates, charging and battery, with made-up data.", host: "demo.getuplink.in", tag: "Demo" },
  },
  status: {
    alt: "Uplink status: whether the website, database and live car data are working.",
    card: { headline: "Is Uplink working?", line: "The website, database and live car data, day by day.", host: "status.getuplink.in", tag: "Status" },
  },
  invite: {
    alt: "You're invited to Uplink: your Tesla's updates, charging and battery, on one page.",
    card: { headline: "You're invited to Uplink.", line: "Your Tesla's updates, charging and battery, on one page. Made for India.", host: "app.getuplink.in", tag: "Invite" },
  },
} satisfies Record<string, { alt: string; card: Card }>;
