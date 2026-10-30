# Fonts

Uplink draws its text in Geist and Geist Mono. Until October 2026 they came from `next/font/google`. Now they're files cut down by hand to what the app uses, served from `public/fonts/`, and they draw every page exactly as before: the same pixels, checked by diffing screenshots of every page before and after.

## What's served

Each font is two files under one family name:

- **Core** (`geist-core.*.woff2` 17.4 KB, `geist-mono-core.*.woff2` 9.9 KB): ASCII, curly quotes, dashes, the ellipsis, the no-break space, and the symbols most pages show (· ₹ © ° é ″ •). Every page preloads both.
- **Extended** (`geist-ext.*.woff2` 10.0 KB, `geist-mono-ext.*.woff2` 11.2 KB): the rest of Latin-1 and Latin Extended-A. Behind `unicode-range`, so a browser only downloads it on a page that shows one of its characters (a place name like Łódź, say).

Before, every page preloaded 52.4 KB (Google's latin files), and the 4 in 10 pages with ₹ in them also pulled both latin-ext files (31.3 KB more). Now every page loads 27.3 KB, and no page of the app needs an extended file.

A character counts even where it isn't drawn in that font: Chrome downloads a face for characters in Next's inline `<script>` page data, which inherits Geist from `<body>`. That's why • is in the Geist core though only Geist Mono draws it ("••••0001" on the Car page).

`app/fonts.css` holds the `@font-face` rules and the two CSS variables Tailwind's `font-sans` and `font-mono` read. `lib/fonts.ts` lists the core files, and `preloadFonts()` preloads them from the root layout and the error page. The file names carry a hash of their contents, so `next.config.ts` caches them for a year. `proxy.ts` skips `/fonts/`: signed out, it would redirect a font to the app host or to `/home`, and the home, waitlist and invite pages would draw in Arial. `test/fonts.test.ts` checks the proxy leaves them alone.

## Rerunning

```bash
uv run scripts/subset-fonts.py
```

Then commit what it wrote (`public/fonts/`, `app/fonts.css`, `lib/fonts.ts`). It needs [uv](https://docs.astral.sh/uv/) and the network (it fetches the fonts from the Google Fonts repository and checks their hashes). It runs by hand, never in the build.

Rerun it when:

- `bun test test/fonts.test.ts` fails. It fails when the source gains a character the last run didn't see, uses a weight class it didn't (`font-bold`, `font-light`…), or turns on `hyphens: auto` (which draws U+2010).
- A page starts drawing text at a weight outside 400 to 900, in italics that should be real italics, or with an OpenType feature not listed below. The test can't see weights set by the browser itself (a `<th>` is bold) or by inline styles, so check those by hand.
- The upstream fonts change. The script stops when a file's hash doesn't match: check the new version draws the same, then update the hash in `FONTS`.

## Decisions

**Same glyphs as before.** The sources are Google Fonts' own files (Geist 1.800, Geist Mono 1.701), the same outlines and metrics `next/font` served, compared point for point. The script compares every glyph it writes with its source at weights 400 to 900 (outlines, and with HarfBuzz the advances and line metrics browsers use) and stops on any difference.

**Same characters as before.** Kept: every character in `app/`, `components/` and `lib/` (`.ts`, `.tsx`, `.js`, `.mjs`, `.json`, `.css`, `.md`), plus all of Latin-1 and Latin Extended-A (for names in data). A character is only kept if Google's files drew it before. ← → ≈ ≥ ⓘ ▸ ●, CJK and emoji drew in the system font then and still do. Dropped, and now drawn in the system font: Cyrillic, Vietnamese, the rest of Latin Extended, € ™ − ‰ † and the like. None of them appear in the app.

**Same kerning as before.** A browser only kerns two characters drawn from the same file. Google split Latin-1 from Latin Extended-A, so the script keeps every character that kerns with ASCII in the core when Google kept it with ASCII, and apart when Google kept it apart. That's why the core holds the accented Latin-1 letters ("Café" kerns f to é). A smaller core of ASCII and punctuation only would save 4.2 KB on Geist but lose those kerns.

**Same composed letters as before.** Google's latin file held the combining macron and diaeresis (U+0304, U+0308), and Chrome tries it first. So Chrome drew Ā Ē Ī Ō Ū Ÿ (and their small letters) from base letter + mark out of that file, kerning with the letters around them, rather than whole from latin-ext. Built that way, the glyphs differ slightly from the whole letters above weight 400. The cores hold the same marks, and are declared last in `app/fonts.css` so browsers try them first. For Geist Mono that pulls ä ë ï ö ü ÿ Ä Ë Ï Ö Ü into the core: otherwise Chrome would build them from a + U+0308 instead of drawing them whole as before.

**Weights 400 to 900.** The app draws 400, 500 and 600, and 700 in one place: the browser's bold `<th>` ("Total" on an invoice). The fonts' masters are at 100, 400 and 900. Dropping everything below 400 removes the 100 master exactly (no point moves). Stopping at 700 (Geist) and 600 (Mono) would save 2.6 KB across the four files, but rescales the 900 master and moves points by up to a unit, so it's off. fontTools' instancer also re-optimises deltas when it narrows an axis (moving ¤ by half a unit), so the script rebuilds the deltas from the source instead.

**Features.** Kept: `kern`, `liga`, `ccmp`, `mark`, `mkmk`, and `tnum` for `tabular-nums` (Geist; Geist Mono's digits are already even). Dropped: `frac`, `numr`, `dnom`, `pnum` and `locl` (only for Turkish, Dutch and the like; the app is `lang="en"`). Google's files had no hinting, and these have none.

**Loading unchanged.** `font-display: swap`, and the same metric-matched fallback faces `next/font` generated (`Geist Fallback`, `Geist Mono Fallback`, both Arial), copied as they were. Core and extended share one family name, so the fallback never draws an extended character while the real font loads.

**Licence.** Both fonts are under the OFL with no Reserved Font Name, so the cut files keep their names. The script checks the licence each run and renames them if one appears. `public/fonts/OFL-geist.txt` and `OFL-geist-mono.txt` travel with them.

## Later

- Inline the two core files into the CSS, so the first paint needs no font request.
- Fetch the extended files when the browser is idle, so a later page with Łódź doesn't wait for one.
