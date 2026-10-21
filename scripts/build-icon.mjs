#!/usr/bin/env node
// Writes app/icon.svg (the favicon) from the shared logo path in lib/logo.ts.
// Usage: bun scripts/build-icon.mjs
import { readFileSync, writeFileSync } from "node:fs";

const path = readFileSync("lib/logo.ts", "utf8").match(/LOGO_PATH = "([^"]+)"/)?.[1];
if (!path) throw new Error("LOGO_PATH not found in lib/logo.ts");

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
console.log("Wrote app/icon.svg");
