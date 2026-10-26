#!/usr/bin/env node
// Writes every icon from the shared logo path in lib/logo.ts:
//   app/icon.svg        the favicon modern browsers use; follows light and dark mode
//   app/favicon.ico     16, 32 and 48 px, for browsers and link previews that ask for /favicon.ico
//   app/apple-icon.png  180 px home screen icon for iPhone and iPad
//   public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png   for app/manifest.ts
// Usage: bun scripts/build-icon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const path = readFileSync("lib/logo.ts", "utf8").match(/LOGO_PATH = "([^"]+)"/)?.[1];
if (!path) throw new Error("LOGO_PATH not found in lib/logo.ts");

// The dark palette from app/globals.css. PNG and ICO icons can't follow dark mode, and iOS fills
// transparency with black, so they are a light mark on the dark background.
const BACKGROUND = "#040404";
const FOREGROUND = "#f8f8f8";

writeFileSync(
  "app/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    rect { fill: #ffffff; } path { stroke: #0a0a0a; }
    @media (prefers-color-scheme: dark) { rect { fill: #040404; } path { stroke: #f8f8f8; } }
  </style>
  <rect width="32" height="32"/>
  <path d="${path}" fill="none" stroke-width="3" stroke-linecap="square"/>
</svg>
`,
);

// The mark, stroke included, spans about x 6.5–28.5 and y 2.5–26.5 of its 32 box, centred at (17.5, 14.5).
// `box` is the side of the square around that centre: 32 fills the tile like the favicon, larger adds a margin.
function tile(px, box) {
  const x = 17.5 - box / 2;
  const y = 14.5 - box / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${x} ${y} ${box} ${box}">
  <rect x="${x}" y="${y}" width="${box}" height="${box}" fill="${BACKGROUND}"/>
  <path d="${path}" fill="none" stroke="${FOREGROUND}" stroke-width="3" stroke-linecap="square"/>
</svg>`);
}

const png = (px, box) => sharp(tile(px, box)).png().toBuffer();

// An .ico holding PNG images: a 6-byte header, a 16-byte entry per image, then the images.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ px, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(px % 256, at);
    header.writeUInt8(px % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const favicon = await Promise.all([16, 32, 48].map(async (px) => ({ px, data: await png(px, 34) })));
writeFileSync("app/favicon.ico", ico(favicon));
writeFileSync("app/apple-icon.png", await png(180, 44));
writeFileSync("public/icon-192.png", await png(192, 44));
writeFileSync("public/icon-512.png", await png(512, 44));
// Android crops maskable icons to a circle 80% across, so the mark gets a wider margin.
writeFileSync("public/icon-maskable-512.png", await png(512, 54));

console.log("Wrote app/icon.svg, app/favicon.ico, app/apple-icon.png and public/icon-{192,512,maskable-512}.png");
