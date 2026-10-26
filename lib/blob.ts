// The account avatar: a soft blob drawn from a seed (the Tesla account id), so the same account
// always gets the same shape and nothing is uploaded or stored.

// FNV-1a: a string to a 32-bit seed.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a small seeded random in [0, 1).
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// One blue blend for every account, picked by the owner; the blob shapes still come from the seed, so
// accounts differ by shape. In oklch so it reads evenly bright in light and dark themes.
const BLUES: [string, string, string] = ["oklch(0.74 0.09 238)", "oklch(0.62 0.11 249)", "oklch(0.86 0.05 215)"];
export function blobColors(_seed: string): [string, string, string] {
  return BLUES;
}

// A closed SVG path around (size/2, size/2): `points` radii between 70% and 100% of the half-size,
// joined by a Catmull-Rom curve so the outline has no corners.
export function blobPath(seed: string, size = 40, points = 7): string {
  const next = random(hash(seed));
  const c = size / 2;
  const vertices = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const r = c * (0.7 + next() * 0.3);
    return [c + Math.cos(angle) * r, c + Math.sin(angle) * r];
  });
  const at = (i: number) => vertices[(i + points) % points];
  let d = `M${round(at(0)[0])},${round(at(0)[1])}`;
  for (let i = 0; i < points; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${round(c1[0])},${round(c1[1])} ${round(c2[0])},${round(c2[1])} ${round(p2[0])},${round(p2[1])}`;
  }
  return `${d}Z`;
}
