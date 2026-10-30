# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools[woff]==4.60.1", "uharfbuzz==0.53.3"]
# ///
"""Cut Geist and Geist Mono down to what Uplink uses, and write the files the app serves.

Run by hand from the repo root, then commit what it writes:

    uv run scripts/subset-fonts.py

It writes public/fonts/*.woff2 (names carry a content hash, so they're cached for a year), public/fonts/OFL-*.txt,
app/fonts.css (the @font-face rules) and lib/fonts.ts (the files every page preloads, and what this run saw).
Nothing here runs in the build. test/fonts.test.ts fails when the source has moved on from the last run.
docs/fonts.md has the decisions and when to rerun.

Each font becomes two files with the same family name: a small core (ASCII, the punctuation and symbols most
pages use) that every page preloads, and an extended file behind unicode-range that only downloads on a page
with one of its characters. Rendering stays identical to the Google Fonts files next/font served before:
- Same outlines and metrics: the sources are the Google Fonts files, checked by hash, and each output is
  compared point for point with its source at every weight it can draw.
- Same characters drawn by Geist: only characters the old Google subsets covered are kept. Anything else
  (CJK, emoji, arrows Google left out) keeps falling back to the system font.
- Same kerning: a browser shapes each file on its own, so two characters only kern if they share a file.
  Characters that kerned together before (in the same Google subset) stay in one file, and characters
  that didn't stay apart. The script checks every kerning pair.
"""

import hashlib
import io
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.request

import uharfbuzz as hb
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ["app", "components", "lib"]
OUT_FONTS = ROOT / "public/fonts"
OUT_CSS = ROOT / "app/fonts.css"
OUT_TS = ROOT / "lib/fonts.ts"

GF = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# The unicode-range of each subset Google Fonts served (from next/font's CSS for Geist 1.800 and Geist Mono 1.701).
# A character outside these drew in the system font before, so it isn't added now even when the font has it.
# Google's latin file lacked U+2020-2021, U+2028-2029 and U+2030 though its range named them (so † came from
# latin-ext, and the rest from the system font): they're left out of LATIN here.
LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-201F,U+2022-2027,U+202A-202F,U+2031-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
VIETNAMESE = "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB"
CYRILLIC = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"
CYRILLIC_EXT = "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"
SYMBOLS2 = "U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F"

# What the core holds besides ASCII: the punctuation most pages use, plus the symbols the demo's pages show
# most (from a crawl of every page: · on 79% of them, ₹ 41%, © 28%, ° 12%, é, ″ and • on a few, — and the
# no-break space on the rest). A character in a page's data counts too, even where it's drawn in the other font:
# Chrome downloads a face for characters in Next's inline <script> data, which inherits Geist from <body>.
# Characters that kern with ASCII join the core on their own, see above.
PUNCTUATION = "\u2018\u2019\u201c\u201d\u2013\u2014\u2026"
# The combining marks Google's latin file held. With them, the core draws Ā Ē Ī Ō Ū Ÿ (and their small letters)
# from base + mark as Google's latin file did, which kerns with the letters around them (see drawn()).
MARKS = "\u0304\u0308\u0329"

FONTS = [
    {
        "family": "Geist",
        "slug": "geist",
        "var": "--font-geist-sans",
        "url": f"{GF}/geist/Geist%5Bwght%5D.ttf",
        "sha256": "73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659",
        "licence": f"{GF}/geist/OFL.txt",
        # Weights the app draws: 400, 500 and 600 from classes, 700 from the browser's bold <th> ("Total" on an
        # invoice). The masters are at 100, 400 and 900. Cutting below 400 is exact. Cutting above 700 would
        # rescale the 900 master and move points by up to a unit, so the top stays at 900 (docs/fonts.md).
        "weights": (400, 900),
        "features": ["ccmp", "liga", "kern", "mark", "mkmk", "tnum"],
        "core": PUNCTUATION + "\u00a0\u00a9\u00b0\u00b7\u00e9\u2022\u2033\u20b9",
        "subsets": [LATIN, LATIN_EXT, VIETNAMESE, CYRILLIC, CYRILLIC_EXT],
        # next/font's metric-matched fallback, unchanged.
        "fallback": "ascent-override:95.94%;descent-override:28.16%;line-gap-override:0.00%;size-adjust:104.76%",
    },
    {
        "family": "Geist Mono",
        "slug": "geist-mono",
        "var": "--font-geist-mono",
        "url": f"{GF}/geistmono/GeistMono%5Bwght%5D.ttf",
        "sha256": "d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196",
        "licence": f"{GF}/geistmono/OFL.txt",
        # 400, 500 and 600 in use; the top stays at 900 for the same reason as Geist.
        "weights": (400, 900),
        # No kerning in Geist Mono, so its split can't change spacing.
        "features": ["ccmp", "mark", "mkmk"],
        "core": PUNCTUATION + "\u00a0\u00b0\u00b7\u2022\u20b9",
        "subsets": [LATIN, LATIN_EXT, VIETNAMESE, CYRILLIC, CYRILLIC_EXT, SYMBOLS2],
        "fallback": "ascent-override:74.67%;descent-override:21.92%;line-gap-override:0.00%;size-adjust:134.59%",
    },
]

SOURCE_SUFFIXES = (".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".md", ".mdx")
ASCII = set(range(0x20, 0x7F))
LATIN_1 = set(range(0xA0, 0x100))
LATIN_EXT_A = set(range(0x100, 0x180))
# Tailwind's weight classes, for the record test/fonts.test.ts checks.
WEIGHT_CLASS = re.compile(r"\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b")


def parse_ranges(s):
    out = set()
    for part in s.split(","):
        lo, _, hi = part.strip()[2:].partition("-")
        out.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return out


def format_ranges(cps):
    cps, out, i = sorted(cps), [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" + (f"-{cps[j]:X}" if j > i else ""))
        i = j + 1
    return ",".join(out)


def fetch(url, sha256=None):
    cache = Path(tempfile.gettempdir()) / "uplink-fonts" / hashlib.sha256(url.encode()).hexdigest()[:16]
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url) as r:
            cache.write_bytes(r.read())
    data = cache.read_bytes()
    if sha256 and hashlib.sha256(data).hexdigest() != sha256:
        cache.unlink()
        sys.exit(f"{url} changed upstream (sha256 {hashlib.sha256(data).hexdigest()}). Check the new version renders the same, then update its sha256.")
    return data


def scan_sources():
    """Every non-ASCII character in the app's source, the weight classes it uses, and whether it hyphenates."""
    chars, weights, hyphens = set(), set(), False
    for d in SOURCES:
        for p in sorted((ROOT / d).rglob("*")):
            if not p.is_file() or p.suffix not in SOURCE_SUFFIXES or p in (OUT_TS, OUT_CSS):
                continue
            text = p.read_text(encoding="utf-8")
            chars.update(ord(c) for c in text if ord(c) > 0x7E)
            weights.update(WEIGHT_CLASS.findall(text))
            hyphens |= bool(re.search(r"\bhyphens-auto\b|hyphens:\s*auto", text))
    # text-transform: uppercase shows a character's capital.
    chars |= {ord(c.upper()) for c in map(chr, chars) if len(c.upper()) == 1}
    # hyphens: auto breaks words with U+2010 HYPHEN, not the ASCII hyphen.
    if hyphens:
        chars.add(0x2010)
    return chars, weights, hyphens


def kerning(font):
    """Pairs of characters with a non-zero kern (GPOS pair adjustment) between them, either way round."""
    if "GPOS" not in font:
        return set()
    cmap, gpos = font.getBestCmap(), font["GPOS"].table
    by_glyph = {}
    for cp, g in cmap.items():
        by_glyph.setdefault(g, []).append(cp)
    lookups = {i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == "kern" for i in fr.Feature.LookupListIndex}

    def moves(v):
        return v is not None and any(getattr(v, a, 0) for a in ("XAdvance", "XPlacement", "YAdvance", "YPlacement"))

    glyph_pairs = set()
    for li in lookups:
        lookup = gpos.LookupList.Lookup[li]
        for st in lookup.SubTable:
            st = st.ExtSubTable if lookup.LookupType == 9 else st
            if st.LookupType != 2:
                continue
            if st.Format == 1:
                for g1, ps in zip(st.Coverage.glyphs, st.PairSet):
                    glyph_pairs.update((g1, r.SecondGlyph) for r in ps.PairValueRecord if moves(r.Value1) or moves(r.Value2))
            else:
                first, second = {}, {}
                for g in st.Coverage.glyphs:
                    first.setdefault(st.ClassDef1.classDefs.get(g, 0), []).append(g)
                for g in by_glyph:
                    second.setdefault(st.ClassDef2.classDefs.get(g, 0), []).append(g)
                for c1, rec in enumerate(st.Class1Record):
                    for c2, r2 in enumerate(rec.Class2Record):
                        if moves(r2.Value1) or moves(r2.Value2):
                            glyph_pairs.update((a, b) for a in first.get(c1, []) for b in second.get(c2, []))
    return {frozenset((a, b)) for g1, g2 in glyph_pairs for a in by_glyph.get(g1, []) for b in by_glyph.get(g2, []) if a != b}


def limit_weight(font, lo, hi):
    """Narrow the wght axis to lo..hi without moving a single point at the weights kept.

    lo must be the default weight: deltas that peak below it never apply then, so they're dropped as they are.
    The instancer does the axis and metrics tables, but it re-optimises every glyph's deltas (moving a few
    points by half a unit), so gvar is rebuilt here from the original, keeping only deltas that can still apply.
    """
    axis = next(a for a in font["fvar"].axes if a.axisTag == "wght")
    assert axis.defaultValue == lo, f"lowest weight {lo} must be the default {axis.defaultValue}"
    assert hi == axis.maxValue, "a lower top weight rescales the masters and moves points; see docs/fonts.md"
    original = {g: list(v) for g, v in font["gvar"].variations.items()}
    font = instantiateVariableFont(font, {"wght": (lo, lo, hi)}, updateFontNames=False)
    font["gvar"].variations = {g: [tv for tv in v if tv.axes.get("wght", (0, 0, 0))[1] > 0] for g, v in original.items()}
    return font


def drawn(cp, faces):
    """Which face (an index into faces, tried in order) draws a character, and from which characters' glyphs.

    Chrome asks each face in turn: a face draws the character itself when it holds it, or its base letter and
    combining mark when it holds those instead (HarfBuzz decomposes Ō to O + U+0304). Firefox and Safari take
    the first face whose unicode-range holds the character, which the extended files keep whole.
    """
    parts = tuple(map(ord, unicodedata.normalize("NFD", chr(cp))))
    for i, face in enumerate(faces):
        if cp in face:
            return i, (cp,)
        if len(parts) > 1 and all(p in face for p in parts):
            return i, parts
    return None, (cp,)


def kerning_between(pairs, chars, old, new):
    """Pairs of characters whose glyphs kern and that were drawn from one face before but not now (lost), or
    the other way round (gained), as (a, b, lost).

    A kern only applies between glyphs a browser shapes together, from one face. A decomposed character
    kerns through its base letter (O + U+0304 kerns as O).
    """
    out = []
    by_char = {}
    for p in pairs:
        a, b = tuple(p)
        by_char.setdefault(a, set()).add(b)
        by_char.setdefault(b, set()).add(a)
    for a in chars:
        for b in chars:
            if a >= b:
                continue
            (fa_old, ga), (fb_old, gb) = drawn(a, old), drawn(b, old)
            (fa_new, _), (fb_new, _) = drawn(a, new), drawn(b, new)
            if ga[0] in by_char and gb[0] in by_char[ga[0]] and (fa_old == fb_old) != (fa_new == fb_new):
                out.append((a, b, fa_old == fb_old))
    return out


def outline(glyphset, name):
    pen = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(pen)
    return pen.value, glyphset[name].width


def subset(font_bytes, unicodes, features, names):
    font = TTFont(io.BytesIO(font_bytes), recalcTimestamp=False)
    options = Options()
    options.layout_features = features
    options.hinting = False
    options.glyph_names = False
    options.name_IDs = names
    options.name_languages = [0x409]
    options.drop_tables += ["STAT", "meta", "DSIG"]
    s = Subsetter(options)
    s.populate(unicodes=unicodes)
    s.subset(font)
    # Options.flavor only applies in the pyftsubset command; saved from code, the font needs its own.
    font.flavor = "woff2"
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def check(path_bytes, source, unicodes, spec):
    """Read a written file back and prove it draws exactly what the source does."""
    font = TTFont(io.BytesIO(path_bytes), recalcTimestamp=False)
    cmap = font.getBestCmap()
    problems = [] if path_bytes[:4] == b"wOF2" else ["not WOFF2"]
    if set(cmap) != set(unicodes):
        problems.append(f"holds {format_ranges(set(cmap) ^ set(unicodes))} it shouldn't (or lacks them)")
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
    if axes != {"wght": spec["weights"]}:
        problems.append(f"axes {axes}")
    feats = {fr.FeatureTag for t in ("GSUB", "GPOS") if t in font and font[t].table.FeatureList for fr in font[t].table.FeatureList.FeatureRecord}
    if not feats <= set(spec["features"]):
        problems.append(f"features {sorted(feats)}")
    for t in ("fpgm", "prep", "cvt ", "hdmx", "LTSH", "VDMX", "cvar"):
        if t in font:
            problems.append(f"hinting table {t}")
    for t, keys in (("hhea", ("ascent", "descent", "lineGap")), ("OS/2", ("sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "fsSelection"))):
        for k in keys:
            if getattr(font[t], k) != getattr(source[t], k):
                problems.append(f"{t}.{k} {getattr(font[t], k)} != {getattr(source[t], k)}")
    if font["head"].unitsPerEm != source["head"].unitsPerEm:
        problems.append("unitsPerEm changed")
    src_cmap = source.getBestCmap()
    lo, hi = spec["weights"]
    for w in sorted({lo, 450, 500, 550, 600, 650, 700, 800, hi}):
        a, b = source.getGlyphSet(location={"wght": w}), font.getGlyphSet(location={"wght": w})
        for cp in unicodes:
            if outline(a, src_cmap[cp]) != outline(b, cmap[cp]):
                problems.append(f"U+{cp:04X} draws differently at {w}")
    # Browsers take advances and metrics from HVAR and MVAR, which fontTools' glyph sets don't read: ask HarfBuzz.
    src_hb, out_hb = hb_font(source), hb_font(font)
    for w in range(int(lo), int(hi) + 1, 25):
        src_hb.set_variations({"wght": w})
        out_hb.set_variations({"wght": w})
        for tag in ("hasc", "hdsc", "hlgp", "undo", "unds", "stro", "strs", "xhgt", "cpht"):
            t = int.from_bytes(tag.encode(), "big")
            if src_hb.get_metric_position(t) != out_hb.get_metric_position(t):
                problems.append(f"{tag} differs at {w}")
        for cp in unicodes:
            if src_hb.get_glyph_h_advance(src_hb.get_nominal_glyph(cp)) != out_hb.get_glyph_h_advance(out_hb.get_nominal_glyph(cp)):
                problems.append(f"U+{cp:04X} advances differently at {w}")
    return problems


def hb_font(font):
    flavor, font.flavor = font.flavor, None
    out = io.BytesIO()
    font.save(out)
    font.flavor = flavor
    return hb.Font(hb.Face(out.getvalue()))


def main():
    used, weights, hyphens = scan_sources()
    css = [f"/* Generated by scripts/subset-fonts.py: rerun it rather than edit this file (docs/fonts.md). */"]
    preloads, summary, written = [], [], set()
    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    root = {}

    for spec in FONTS:
        source_bytes = fetch(spec["url"], spec["sha256"])
        licence = fetch(spec["licence"]).decode()
        source = TTFont(io.BytesIO(source_bytes), recalcTimestamp=False)
        family = spec["family"]

        names = [0, 1, 2, 3, 4, 5, 6]
        # The OFL lets a Reserved Font Name only travel on the unmodified font; a subset needs another name.
        if re.search(r"Reserved\s+Font\s+Name", licence, re.I):
            for rec in source["name"].names:
                if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25):
                    rec.string = rec.toUnicode().replace(family, f"{family} Uplink").replace(family.replace(" ", ""), family.replace(" ", "") + "Uplink")
        licence_name = f"OFL-{spec['slug']}.txt"
        (OUT_FONTS / licence_name).write_text(licence)
        written.add(licence_name)

        limited = limit_weight(source, *spec["weights"])
        buf = io.BytesIO()
        limited.save(buf)
        limited_bytes = buf.getvalue()

        has = set(source.getBestCmap())
        # What each old Google file could draw, in the order a browser tried them (latin first).
        old = [parse_ranges(r) & has for r in spec["subsets"]]
        served = set().union(*old)
        wanted = (ASCII | set(map(ord, spec["core"] + MARKS)) | used | LATIN_1 | LATIN_EXT_A) & served
        dropped_used = sorted(c for c in used if c not in wanted and c >= 0xA0)

        pairs = {p for p in kerning(source) if all(c in has for c in p)}
        core = (ASCII | set(map(ord, spec["core"] + MARKS))) & wanted
        # Grow the core until every character draws as before: from the same glyphs, and kerning with the same
        # neighbours (two characters only kern when they're drawn from one file).
        while True:
            new_faces = [core, wanted - core]
            moves = set()
            for c in wanted - core:
                if drawn(c, old)[1] != drawn(c, new_faces)[1]:
                    moves.add(c)  # the core would draw it from base + mark where Google drew it whole
            for a, b, lost in kerning_between(pairs, wanted, old, new_faces):
                if lost:  # bring in whichever of the two the extended file draws
                    moves |= {x for x in (a, b) if drawn(x, new_faces)[0] != 0}
            if not moves:
                break
            core |= moves
        extended = wanted - core
        for c in wanted:
            if drawn(c, old)[1] != drawn(c, [core, extended])[1]:
                sys.exit(f"{family}: U+{c:04X} would draw from other glyphs than before")
        for a, b, lost in kerning_between(pairs, wanted, old, [core, extended]):
            sys.exit(f"{family}: U+{a:04X} and U+{b:04X} would {'lose' if lost else 'gain'} a kern. Move one of them in FONTS.")

        faces = []
        for part, cps in (("core", core), ("ext", extended)):
            data = subset(limited_bytes, sorted(cps), spec["features"], names)
            problems = check(data, source, sorted(cps), spec)
            if problems:
                sys.exit(f"{family} {part}: " + "; ".join(problems[:10]))
            name = f"{spec['slug']}-{part}.{hashlib.sha256(data).hexdigest()[:10]}.woff2"
            (OUT_FONTS / name).write_bytes(data)
            written.add(name)
            faces.append((name, cps))
            if part == "core":
                preloads.append(f"/fonts/{name}")
            summary.append(f"  {name:36} {len(data):>6} B  {len(cps):>3} characters")

        lo, hi = spec["weights"]
        # Declared last, the core is tried first, as Google's latin file was: Chrome then draws a character the
        # core lacks (Ō) from its base and a combining mark (O + U+0304) when the core has both, as before.
        for name, cps in reversed(faces):
            css.append(f'@font-face{{font-family:"{family}";font-style:normal;font-weight:{lo} {hi};font-display:swap;src:url(/fonts/{name}) format("woff2");unicode-range:{format_ranges(cps)}}}')
        css.append(f'@font-face{{font-family:"{family} Fallback";src:local("Arial");{spec["fallback"]}}}')
        root[spec["var"]] = f'"{family}", "{family} Fallback"'
        if dropped_used:
            summary.append(f"  {family} leaves to the system font, as before: {''.join(map(chr, dropped_used))}")

    css.append(":root{" + ";".join(f"{k}:{v}" for k, v in root.items()) + "}")
    OUT_CSS.write_text("\n".join(css) + "\n")

    for old in [*OUT_FONTS.glob("*.woff2"), *OUT_FONTS.glob("*.txt")]:
        if old.name not in written:
            old.unlink()

    OUT_TS.write_text(
        "// Generated by scripts/subset-fonts.py: rerun it rather than edit this file (docs/fonts.md).\n"
        "\n"
        'import { preload } from "react-dom";\n'
        "\n"
        "// The core file of each font, preloaded on every page. The extended files load only when a page needs them.\n"
        f"export const FONT_PRELOADS = {json.dumps(preloads)};\n"
        "\n"
        "// Called by the root layout and the error page while they render; React sends these as Link headers.\n"
        "export function preloadFonts() {\n"
        '  for (const href of FONT_PRELOADS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "" });\n'
        "}\n"
        "\n"
        "// What the last run saw in app/, components/ and lib/. test/fonts.test.ts compares the source with these.\n"
        f"export const FONT_SOURCE_CHARS = {json.dumps(''.join(map(chr, sorted(used))))};\n"
        f"export const FONT_WEIGHT_CLASSES = {json.dumps(sorted(weights))};\n"
        f"export const FONT_HYPHENS_AUTO = {json.dumps(hyphens)};\n"
    )
    print("\n".join(summary))
    print(f"Wrote {OUT_CSS.relative_to(ROOT)}, {OUT_TS.relative_to(ROOT)} and public/fonts/.")


if __name__ == "__main__":
    main()
