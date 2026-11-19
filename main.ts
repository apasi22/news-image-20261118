// news-image-20261118 — draws one newspaper poster summing up Wednesday
// 18 November 2026's world news. Node 22, standard library only, no network.
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png).
// Run with argument "digit-test" to render a digit test sheet instead.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------- raster ----------------
const W = 1024;
const H = 1024;
const img = Buffer.from(new Uint8Array(W * H * 3));

type RGB = [number, number, number];
function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const PAPER = hex("#f6f0dc");
const INK = hex("#1b1813");
const NAVY = hex("#122541");
const RED = hex("#b3261e");
const BLUE = hex("#1d4e89");
const GREEN = hex("#2e6b34");
const ORANGE = hex("#c2571b");
const PURPLE = hex("#6b3fa0");
const TEAL = hex("#0f766e");
const GOLD = hex("#a67c00");
const GREY = hex("#6b6558");
const WHITE = hex("#ffffff");
const CREAM = hex("#fbf7ea");

function px(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 3;
  img[o] = c[0];
  img[o + 1] = c[1];
  img[o + 2] = c[2];
}
const discCache = new Map<number, [number, number][]>();
function discMask(r: number): [number, number][] {
  const key = Math.round(r * 4);
  let m = discCache.get(key);
  if (m) return m;
  m = [];
  const rr = key / 4;
  const ri = Math.ceil(rr);
  for (let y = -ri; y <= ri; y++) {
    for (let x = -ri; x <= ri; x++) {
      if (x * x + y * y <= rr * rr + 0.5) m.push([x, y]);
    }
  }
  discCache.set(key, m);
  return m;
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const m = discMask(r);
  const bx = Math.round(cx);
  const by = Math.round(cy);
  for (const [dx, dy] of m) px(bx + dx, by + dy, c);
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const o = (yy * W + xx) * 3;
      img[o] = c[0];
      img[o + 1] = c[1];
      img[o + 2] = c[2];
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, wd: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / 0.45));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + dx * t, y0 + dy * t, wd / 2, c);
  }
}
function poly(pts: [number, number][], wd: number, c: RGB, close: boolean): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], wd, c);
  }
  if (close && pts.length > 2) {
    line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], wd, c);
  }
}
function fillPoly(pts: [number, number][], c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of pts) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) px(x, y, c);
    }
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  disc(cx, cy, r, c);
}
function ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const steps = Math.max(24, Math.ceil(r * 4));
  for (let i = 0; i < steps; i++) {
    const a1 = (i / steps) * Math.PI * 2;
    const a2 = ((i + 1) / steps) * Math.PI * 2;
    line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, w, c);
  }
}

// ---------------- PNG ----------------
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const v of b) c = CRC_T[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngEncode(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    img.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- two faces: clean sans (default) + bold serif (title) ----------------
// Glyph space: x 0..56, baseline y=0, cap height 70, x-height 48,
// ascender 72, descender -24. The sans face (FONT) is a clean even-stroke
// face: plain stems, uniform rings and arcs, no serifs — the modern
// data-journalism look. The serif face (SERIF) is used only for the big
// title and the badge "18": bracketed serifs, thick/thin contrast, tapered
// diagonals — a real printed newspaper serif. Every glyph is a list of
// parts; each part is one even-odd fill, and parts are drawn in order, so
// overlapping solid shapes compose correctly. All advances are unchanged
// from the previous font, so every line still fits exactly as before.
type Ctr = [number, number][];
type Part = Ctr[];
type OGlyph = [number, Part[]];
const rect = (x0: number, y0: number, x1: number, y1: number): Ctr => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const ell = (cx: number, cy: number, rx: number, ry: number, n = 24): Ctr => {
  const p: Ctr = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
// Thick arc band, angles in degrees (0 = east, 90 = north), a1 > a0.
const arcBand = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, th: number, n = 16): Ctr => {
  const p: Ctr = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + (rx - th) * Math.cos(a), cy + (ry - th) * Math.sin(a)]);
  }
  return p;
};
const bowl = (cx: number, cy: number, rx: number, ry: number, th: number): Part => [
  ell(cx, cy, rx, ry),
  ell(cx, cy, rx - th, ry - th),
];
const diag = (x0: number, y0: number, x1: number, y1: number, w: number): Ctr => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return [
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ];
};
// Plain vertical stem (no serifs) — the sans face. The top/bot parameters
// are kept for call-site compatibility and ignored; bracketed serifs live
// in stemS below and are used only by the serif face.
const stem = (x: number, y0: number, y1: number, w: number, top = true, bot = true): Part[] => {
  return [[rect(x, y0, x + w, y1)]];
};
// Quadratic bezier sampler (for serif brackets).
const quad = (p0: [number, number], p1: [number, number], p2: [number, number], n = 4): Ctr => {
  const pts: Ctr = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
};
// Bracketed-serif stem (serif face only): one closed outline. The serif is
// a slab whose top edge curves (brackets) into the stem, so the foot reads
// as a real printed serif instead of a flat rectangle. s = serif extension,
// h = serif height, b = bracket rise.
const stemS = (x: number, y0: number, y1: number, w: number, top = true, bot = true): Part => {
  const s = 3, h = 4, b = 5;
  const pts: Ctr = [];
  if (bot) {
    pts.push([x - s, y0], [x - s, y0 + h]);
    pts.push(...quad([x - s, y0 + h], [x - s, y0 + h + b], [x, y0 + h + b]).slice(1));
  } else {
    pts.push([x, y0]);
  }
  if (top) {
    pts.push([x, y1 - h - b]);
    pts.push(...quad([x, y1 - h - b], [x, y1 - h], [x - s, y1 - h]).slice(1));
    pts.push([x - s, y1], [x + w + s, y1], [x + w + s, y1 - h]);
    pts.push(...quad([x + w + s, y1 - h], [x + w + s, y1 - h - b], [x + w, y1 - h - b]).slice(1));
  } else {
    pts.push([x, y1], [x + w, y1]);
  }
  if (bot) {
    pts.push([x + w, y0 + h + b]);
    pts.push(...quad([x + w, y0 + h + b], [x + w + s, y0 + h + b], [x + w + s, y0 + h]).slice(1));
    pts.push([x + w + s, y0]);
  } else {
    pts.push([x + w, y0]);
  }
  return [pts];
};
// Contrast ring (serif face): thick at the sides, thin at top/bottom.
const bowlC = (cx: number, cy: number, rx: number, ry: number, thSide: number, thTop: number): Part => [
  ell(cx, cy, rx, ry),
  ell(cx, cy, rx - thSide, ry - thTop),
];
// Contrast arc band (serif face): thickness varies from thSide at the
// horizontal extremes to thTop at the vertical extremes (vertical stress).
const arcC = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, thSide: number, thTop: number, n = 16): Ctr => {
  const p: Ctr = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    const th = thTop + (thSide - thTop) * Math.abs(Math.cos(a));
    p.push([cx + (rx - th) * Math.cos(a), cy + (ry - th) * Math.sin(a)]);
  }
  return p;
};
// Tapered diagonal (serif face): width w0 at the start, w1 at the end.
const diagT = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): Ctr => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  return [
    [x0 + nx * (w0 / 2), y0 + ny * (w0 / 2)],
    [x1 + nx * (w1 / 2), y1 + ny * (w1 / 2)],
    [x1 - nx * (w1 / 2), y1 - ny * (w1 / 2)],
    [x0 - nx * (w0 / 2), y0 - ny * (w0 / 2)],
  ];
};
const FONT: Record<string, OGlyph> = {
  "0": [60, [bowl(28, 35, 20, 32, 7)]],
  "1": [60, [...stem(26, 0, 70, 11), [diag(18, 56, 30, 70, 7)]]],
  "2": [60, [[arcBand(28, 54, 16, 13, -10, 190, 7)], [diag(44, 52, 12, 6, 7)], [rect(8, 0, 48, 7)]]],
  "3": [60, [[arcBand(29, 54, 14, 13, -50, 180, 7)], [arcBand(29, 19, 15, 14, 180, 410, 7)], [rect(30, 26, 44, 48)]]],
  "4": [60, [[diag(40, 70, 12, 24, 7)], [rect(8, 19, 44, 26)], ...stem(32, 0, 70, 9, false, true)]],
  "5": [60, [[rect(10, 63, 44, 70)], ...stem(10, 36, 68, 9, false, false), [rect(10, 32, 32, 39)], [arcBand(28, 20, 15, 16, 250, 450, 7)]]],
  "6": [60, [[arcBand(28, 40, 15, 18, 90, 270, 7)], bowl(28, 22, 15, 18, 7)]],
  "7": [60, [[rect(8, 63, 48, 70)], [diag(46, 70, 24, 0, 7)]]],
  "8": [60, [bowl(28, 52, 14, 14, 7), bowl(28, 20, 15, 16, 7)]],
  "9": [60, [bowl(28, 48, 15, 18, 7), ...stem(38, 0, 50, 9, false, false)]],
  A: [60, [[diag(6, 0, 28, 70, 9)], [diag(28, 70, 50, 0, 9)], [rect(14, 23, 42, 30)]]],
  B: [60, [...stem(8, 0, 70, 11), bowl(29, 53, 14, 14, 7), bowl(29, 19, 15, 15, 7)]],
  C: [60, [[arcBand(28, 35, 20, 33, 45, 315, 7)]]],
  D: [60, [...stem(8, 0, 70, 11), [ell(30, 35, 20, 33), ell(30, 35, 14, 27)]]],
  E: [60, [...stem(8, 0, 70, 11), [rect(8, 63, 48, 70)], [rect(8, 31, 38, 38)], [rect(8, 0, 48, 7)]]],
  F: [60, [...stem(8, 0, 70, 11), [rect(8, 63, 48, 70)], [rect(8, 31, 38, 38)]]],
  G: [60, [[arcBand(28, 35, 20, 33, 45, 315, 7)], [rect(28, 27, 48, 34)], ...stem(43, 4, 30, 7, false, false)]],
  H: [60, [...stem(8, 0, 70, 11), ...stem(39, 0, 70, 11), [rect(8, 31, 49, 38)]]],
  I: [60, [[rect(24, 0, 35, 70)], [rect(14, 63, 38, 70)], [rect(14, 0, 38, 7)]]],
  J: [60, [...stem(34, 0, 70, 11, true, false), [arcBand(30, 12, 16, 12, 180, 270, 7)]]],
  K: [60, [...stem(8, 0, 70, 11), [diag(16, 34, 44, 70, 8)], [diag(22, 26, 44, 0, 8)]]],
  L: [60, [...stem(8, 0, 70, 11), [rect(8, 0, 48, 7)]]],
  M: [60, [...stem(6, 0, 70, 11), [diag(6, 70, 28, 28, 8)], [diag(28, 28, 50, 70, 8)], ...stem(47, 0, 70, 11)]],
  N: [60, [...stem(8, 0, 70, 11), [diag(8, 70, 48, 0, 8)], ...stem(39, 0, 70, 11)]],
  O: [60, [bowl(28, 35, 21, 33, 7)]],
  P: [60, [...stem(8, 0, 70, 11), bowl(29, 53, 14, 14, 7)]],
  Q: [60, [bowl(28, 35, 21, 33, 7), [diag(38, 14, 52, -4, 6)]]],
  R: [60, [...stem(8, 0, 70, 11), bowl(29, 53, 14, 14, 7), [diag(28, 36, 48, 0, 7)]]],
  S: [60, [[arcBand(28, 52, 16, 15, 25, 270, 7)], [arcBand(28, 20, 16, 15, 200, 450, 7)]]],
  T: [60, [[rect(6, 63, 50, 70)], ...stem(24, 0, 70, 11)]],
  U: [60, [...stem(8, 0, 70, 11), ...stem(39, 0, 70, 11), [arcBand(28, 12, 15, 12, 180, 360, 7)]]],
  V: [60, [[diag(8, 70, 28, 0, 9)], [diag(28, 0, 48, 70, 9)]]],
  W: [60, [[diag(4, 70, 14, 0, 7)], [diag(14, 0, 28, 70, 7)], [diag(28, 70, 42, 0, 7)], [diag(42, 0, 52, 70, 7)]]],
  X: [60, [[diag(10, 70, 46, 0, 8)], [diag(46, 70, 10, 0, 8)]]],
  Y: [60, [[diag(8, 70, 28, 36, 9)], [diag(48, 70, 28, 36, 9)], ...stem(24, 0, 38, 11)]],
  Z: [60, [[rect(8, 63, 48, 70)], [diag(48, 70, 8, 0, 6)], [rect(8, 0, 48, 7)]]],
  a: [54, [bowl(26, 27, 17, 20, 6), ...stem(37, 8, 48, 10)]],
  b: [54, [...stem(10, 0, 72, 10), bowl(27, 27, 17, 20, 6)]],
  c: [54, [[arcBand(27, 27, 17, 21, 50, 310, 6)]]],
  d: [54, [bowl(27, 27, 17, 20, 6), ...stem(37, 0, 72, 10)]],
  e: [54, [[arcBand(27, 28, 17, 20, 25, 335, 6)], [rect(10, 24, 44, 28)]]],
  f: [48, [...stem(20, 0, 66, 10, false, true), [arcBand(24, 58, 9, 9, 0, 180, 7)], [rect(8, 43, 38, 50)]]],
  g: [54, [bowl(26, 34, 15, 14, 7), bowl(26, -10, 13, 9, 7), ...stem(34, -19, 48, 10, true, false)]],
  h: [54, [...stem(10, 0, 72, 10), [arcBand(23, 34, 14, 12, 0, 180, 7)], ...stem(36, 0, 34, 10, false, true)]],
  i: [28, [...stem(10, 0, 48, 10, false, true), [rect(10, 60, 18, 68)]]],
  j: [30, [...stem(11, -20, 48, 10, false, false), [arcBand(15, -10, 9, 9, 180, 270, 6)], [rect(11, 60, 19, 68)]]],
  k: [54, [...stem(10, 0, 72, 10), [diag(18, 26, 42, 48, 7)], [diag(22, 20, 42, 0, 7)]]],
  l: [28, [...stem(10, 0, 72, 10)]],
  m: [58, [...stem(6, 0, 48, 10), [arcBand(20, 34, 13, 12, 0, 180, 7)], ...stem(26, 0, 34, 10, false, true), [arcBand(40, 34, 13, 12, 0, 180, 7)], ...stem(46, 0, 34, 10, false, true)]],
  n: [54, [...stem(10, 0, 48, 10), [arcBand(26, 34, 17, 12, 0, 180, 7)], ...stem(36, 0, 34, 10, false, true)]],
  o: [54, [bowl(27, 27, 17, 21, 6)]],
  p: [54, [...stem(10, -24, 48, 10, false, false), bowl(27, 27, 17, 20, 6)]],
  q: [54, [bowl(27, 27, 17, 20, 6), ...stem(37, -24, 48, 10, false, false)]],
  r: [54, [...stem(10, 0, 48, 10), [arcBand(24, 28, 13, 15, -30, 100, 7)]]],
  s: [54, [[arcBand(27, 38, 14, 11, 25, 270, 7)], [arcBand(27, 16, 14, 11, 200, 450, 7)]]],
  t: [36, [...stem(14, -2, 68, 10, false, true), [rect(4, 43, 32, 50)]]],
  u: [54, [...stem(10, 0, 48, 10), ...stem(36, 0, 48, 10), [arcBand(27, 12, 13, 12, 180, 360, 7)]]],
  v: [54, [[diag(8, 48, 26, 0, 8)], [diag(26, 0, 44, 48, 8)]]],
  w: [50, [[diag(6, 48, 17, 0, 7)], [diag(17, 0, 28, 48, 7)], [diag(28, 48, 39, 0, 7)], [diag(39, 0, 48, 48, 7)]]],
  x: [54, [[diag(10, 48, 42, 0, 7)], [diag(42, 48, 10, 0, 7)]]],
  y: [54, [[diag(8, 48, 26, 6, 8)], [diag(26, 6, 44, 48, 8)], [diag(26, 6, 16, -20, 7)]]],
  z: [54, [[rect(8, 42, 46, 49)], [diag(46, 48, 8, 0, 6)], [rect(8, 0, 46, 7)]]],
  " ": [28, []],
  ".": [28, [[rect(23, 0, 29, 6)]]],
  ",": [28, [[rect(23, 0, 29, 6)], [diag(28, 2, 20, -12, 5)]]],
  ":": [28, [[rect(23, 26, 29, 32)], [rect(23, 4, 29, 10)]]],
  ";": [28, [[rect(23, 26, 29, 32)], [rect(23, 4, 29, 10)], [diag(28, 6, 20, -10, 5)]]],
  "'": [22, [[diag(15, 68, 10, 54, 6)]]],
  '"': [40, [[diag(13, 68, 8, 54, 6)], [diag(31, 68, 26, 54, 6)]]],
  "!": [28, [[rect(23, 18, 29, 68)], [rect(23, 0, 29, 6)]]],
  "?": [60, [[arcBand(28, 54, 14, 12, 200, 380, 7)], [diag(40, 48, 27, 30, 6)], [rect(24, 2, 30, 8)]]],
  "-": [34, [[rect(10, 24, 26, 30)]]],
  "—": [56, [[rect(4, 24, 52, 30)]]],
  "(": [30, [[arcBand(34, 35, 10, 33, 60, 300, 6)]]],
  ")": [30, [[arcBand(22, 35, 10, 33, 240, 480, 6)]]],
  "%": [64, [[diag(14, 68, 42, 2, 6)], bowl(17, 56, 7, 7, 4), bowl(39, 14, 7, 7, 4)]],
  "/": [34, [[diag(10, 0, 26, 70, 6)]]],
  $: [60, [[arcBand(28, 52, 16, 15, 25, 270, 7)], [arcBand(28, 20, 16, 15, 200, 450, 7)], ...stem(25, -6, 76, 6, false, false)]],
  "€": [60, [[arcBand(28, 35, 20, 33, 45, 315, 7)], [rect(6, 28, 50, 35)], [rect(6, 42, 50, 49)]]],
  "+": [60, [[rect(24, 14, 30, 56)], [rect(10, 32, 46, 38)]]],
  "=": [60, [[rect(10, 37, 46, 43)], [rect(10, 17, 46, 23)]]],
  "•": [28, [[ell(26, 30, 5, 5)]]],
};

// Serif face — used ONLY for the big title ("Wednesday 18 November 2026")
// and the calendar badge "18". Real printed-serif construction: bracketed
// serifs (stemS), thick/thin contrast in bowls and arcs (bowlC/arcC), and
// tapered diagonals (diagT). Same advances as the sans face, so the title
// still fits exactly as before.
const SERIF: Record<string, OGlyph> = {
  "0": [60, [bowlC(28, 35, 20, 32, 9, 5)]],
  "1": [60, [stemS(26, 0, 70, 11, false, true), [diagT(17, 55, 29, 70, 7, 5)]]],
  "2": [60, [[arcC(28, 54, 16, 13, -10, 190, 7, 4)], [diagT(44, 52, 12, 6, 6, 6)], [rect(8, 0, 48, 7)]]],
  "6": [60, [[arcC(28, 40, 15, 18, 90, 270, 7, 4)], bowlC(28, 22, 15, 18, 8, 4)]],
  "8": [60, [bowlC(28, 52, 14, 14, 8, 4), bowlC(28, 20, 15, 16, 8, 4)]],
  W: [60, [[diagT(4, 70, 14, 0, 10, 6)], [diagT(14, 0, 28, 70, 6, 10)], [diagT(28, 70, 42, 0, 10, 6)], [diagT(42, 0, 52, 70, 6, 10)]]],
  N: [60, [stemS(8, 0, 70, 11), [diagT(10, 68, 46, 2, 7, 5)], stemS(39, 0, 70, 11)]],
  a: [54, [bowlC(26, 41, 12, 8, 5, 3), bowlC(26, 20, 17, 17, 8, 4), stemS(37, 0, 48, 10)]],
  b: [54, [stemS(10, 0, 72, 10), bowlC(27, 27, 17, 20, 8, 4)]],
  d: [54, [bowlC(27, 27, 17, 20, 8, 4), stemS(37, 0, 72, 10)]],
  e: [54, [[arcC(27, 28, 17, 20, 25, 335, 6, 4)], [rect(10, 24, 44, 28)]]],
  m: [58, [stemS(6, 0, 48, 10), [arcC(20, 34, 13, 12, 0, 180, 7, 4)], stemS(26, 0, 34, 10, false, true), [arcC(40, 34, 13, 12, 0, 180, 7, 4)], stemS(46, 0, 34, 10, false, true)]],
  n: [54, [stemS(10, 0, 48, 10), [arcC(26, 34, 17, 12, 0, 180, 7, 4)], stemS(36, 0, 34, 10, false, true)]],
  o: [54, [bowlC(27, 27, 17, 21, 8, 4)]],
  r: [54, [stemS(10, 0, 48, 10), [arcC(23, 34, 13, 12, 0, 120, 6, 3)], [rect(32, 22, 38, 34)]]],
  s: [54, [[arcC(27, 38, 14, 11, 25, 270, 7, 4)], [arcC(27, 16, 14, 11, 200, 450, 7, 4)]]],
  v: [54, [[diagT(8, 48, 26, 0, 10, 5)], [diagT(44, 48, 26, 0, 6, 5)]]],
  y: [54, [[diagT(8, 48, 26, 8, 10, 6)], [diagT(44, 48, 26, 8, 6, 6)], [diagT(26, 8, 16, -20, 6, 5)]]],
  " ": [28, []],
};

// Even-odd scanline fill over several contours at once (a ring = outer +
// inner contour; parts are filled one after another, so a bar drawn after
// a ring covers the counter where it crosses it).
function fillPart(contours: [number, number][][], c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const pts of contours) {
    for (const [, y] of pts) {
      minY = Math.min(minY, Math.floor(y));
      maxY = Math.max(maxY, Math.ceil(y));
    }
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (const pts of contours) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) px(x, y, c);
    }
  }
}

function drawGlyph(ch: string, bx: number, by: number, size: number, color: RGB, _weight: number, slant = 0, face: "serif" | "sans" = "sans"): number {
  const table = face === "serif" ? SERIF : FONT;
  const g = table[ch] ?? FONT[ch];
  if (!g) return size * 0.4;
  const s = size / 70;
  for (const part of g[1]) {
    const scr: [number, number][][] = part.map((ctr) => ctr.map(([x, y]): [number, number] => [bx + (x + y * slant) * s, by - y * s]));
    fillPart(scr, color);
  }
  return g[0] * s;
}

function textWidth(s: string, size: number, ls = 0, face: "serif" | "sans" = "sans"): number {
  const table = face === "serif" ? SERIF : FONT;
  let w = 0;
  for (const ch of s) {
    const g = table[ch] ?? FONT[ch];
    w += ((g ? g[0] : 30) * size) / 70 + ls;
  }
  return w - ls;
}
type TextOpts = { weight?: number; ls?: number; align?: "left" | "center" | "right"; italic?: boolean; face?: "serif" | "sans" };
function drawText(s: string, x: number, y: number, size: number, color: RGB, opts: TextOpts = {}): void {
  const ls = opts.ls ?? 0;
  const weight = opts.weight ?? 5;
  const slant = opts.italic ? 0.16 : 0;
  const face = opts.face ?? "sans";
  const w = textWidth(s, size, ls, face);
  let bx = x;
  if (opts.align === "center") bx = x - w / 2;
  if (opts.align === "right") bx = x - w;
  for (const ch of s) {
    const adv = drawGlyph(ch, bx, y, size, color, weight, slant, face);
    if (weight >= 7) {
      // Bold: draw the same glyph twice more, shifted left and right.
      // Vertical stems get ~40% thicker; horizontal strokes only get
      // longer, so the thick/thin contrast survives; counters stay open.
      const off = (size / 70) * 1.4;
      drawGlyph(ch, bx - off, y, size, color, weight, slant, face);
      drawGlyph(ch, bx + off, y, size, color, weight, slant, face);
    }
    bx += adv + ls;
  }
}
function wrap(s: string, maxW: number, size: number, ls = 0, face: "serif" | "sans" = "sans"): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, size, ls, face) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(s: string, x: number, y: number, maxW: number, size: number, lh: number, color: RGB, opts: TextOpts = {}): number {
  const lines = wrap(s, maxW, size, opts.ls ?? 0, opts.face ?? "sans");
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, size, color, opts));
  return lines.length;
}
function fitSize(s: string, maxW: number, size: number, ls = 0, face: "serif" | "sans" = "sans"): number {
  let sz = size;
  while (sz > 8 && textWidth(s, sz, ls, face) > maxW) sz -= 1;
  return sz;
}
// Shrink the font (never below minSize) until the text fits in maxLines.
function drawParaFit(s: string, x: number, y: number, maxW: number, size: number, lh: number, color: RGB, opts: TextOpts, maxLines: number, minSize: number): number {
  let sz = size;
  let lines = wrap(s, maxW, sz, opts.ls ?? 0, opts.face ?? "sans");
  while (lines.length > maxLines && sz > minSize) {
    sz -= 0.5;
    lines = wrap(s, maxW, sz, opts.ls ?? 0, opts.face ?? "sans");
  }
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, sz, color, opts));
  return lines.length;
}

// ---------------- digit test sheet ----------------
function drawDigitTest(): void {
  fillRect(0, 0, W, H, PAPER);
  drawText("DIGIT TEST", 28, 70, 44, INK, { weight: 7, ls: 2 });
  drawText("18 NOVEMBER 2026", 28, 130, 30, RED, { weight: 6, ls: 1 });
  drawText("WEDNESDAY 18 NOVEMBER 2026", 28, 200, 44, INK, { weight: 7 });
  const digits = "0123456789";
  let x = 28;
  for (const d of digits) {
    drawText(d, x, 330, 110, INK, { weight: 8 });
    x += 100;
  }
  drawText("144,302  50.12%  11,504  5,630  5,412", 28, 430, 34, INK, { weight: 6 });
  drawText("27.5 years  910 hPa  220 km/h  57-34  $115.8B", 28, 500, 32, INK, { weight: 6 });
  drawText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 28, 600, 40, INK, { weight: 6 });
  drawText("abcdefghijklmnopqrstuvwxyz", 28, 660, 40, INK, { weight: 6 });
  drawText("The quick brown fox jumps over the lazy dog. 1234567890", 28, 730, 30, INK, { weight: 5 });
  drawText("Gulf drones hit U.S. bases; all intercepted.", 28, 790, 30, INK, { weight: 5 });
  drawText("€45bn  $81.3bn  251-11  56-44  144,302", 28, 860, 30, INK, { weight: 6 });
}

// ---------------- content (all facts verified against primary sources) ----------------
type Lead = { num: number; kicker: string; head: string; deck: string; art: number; src: string };
const LEADS: Lead[] = [
  {
    num: 1,
    kicker: "THE GULF",
    head: "Iran drones hit U.S. bases in Gulf",
    deck: "Iran fires drones at U.S. bases in Kuwait and Bahrain; all intercepted.",
    art: 1,
    src: "BBC",
  },
  {
    num: 2,
    kicker: "SHENZHEN",
    head: "Xi and Putin meet as APEC opens",
    deck: "Xi opens the 33rd APEC meeting of 21 economies and urges free trade.",
    art: 2,
    src: "APEC",
  },
  {
    num: 3,
    kicker: "CRIMEA",
    head: "Kerch bridge down; rail back",
    deck: "Strikes drop the road span; Russia says trains run again. Rebuild: 2 years.",
    art: 3,
    src: "REUTERS",
  },
];
type GridItem = { num: number; cat: string; color: RGB; head: string; deck: string; art: number; src: string };
const GRID: GridItem[] = [
  { num: 4, cat: "UKRAINE", color: BLUE, head: "Russia fires 141 drones; 126 downed", deck: "126 of 141 drones downed; a strike on Odesa kills 4.", art: 1, src: "UKR AIR FORCE" },
  { num: 5, cat: "FED", color: GREEN, head: "Minutes point to more hikes", deck: "Almost all see more hikes; a couple eye a half-point move.", art: 2, src: "FED" },
  { num: 6, cat: "EU", color: BLUE, head: "EU offers Kyiv a €45bn loan", deck: "€45bn loan for 2027; Kyiv repays only after Russia pays.", art: 3, src: "EU" },
  { num: 7, cat: "CONGRESS", color: BLUE, head: "Democrats pick Jeffries for speaker", deck: "A 251-11 vote; he would be the first Black Speaker in January.", art: 4, src: "AP" },
  { num: 8, cat: "QUAD", color: BLUE, head: "Leaders meet in Manila", deck: "Trump, Modi, Takaichi, Albanese back joint patrols.", art: 5, src: "REUTERS" },
  { num: 9, cat: "U.S. SENATE", color: BLUE, head: "Peltola flips Alaska", deck: "Peltola beats Sullivan 144,302 to 131,844; Senate 56-44.", art: 6, src: "AP" },
  { num: 10, cat: "GAZA", color: RED, head: "Israeli tanks cross ceasefire line", deck: "First ground push since the truce; troops enter Nuseirat, Bureij.", art: 7, src: "REUTERS" },
  { num: 11, cat: "EBOLA", color: PURPLE, head: "Congo toll: 11,504 cases", deck: "5,630 deaths to 16 Nov; Africa CDC: 'still out of control'.", art: 8, src: "WHO" },
  { num: 12, cat: "HEALTH", color: TEAL, head: "U.S. loses measles-free status", deck: "PAHO ends 26 years of elimination; 5,412 cases in 2026.", art: 9, src: "PAHO" },
  { num: 13, cat: "RUSSIA", color: INK, head: "An-12 crash kills all 19 aboard", deck: "An-12 falls near Kemerovo; criminal case opens on 18 Nov.", art: 10, src: "REUTERS" },
  { num: 14, cat: "WEATHER", color: BLUE, head: "Cyclone Xavier hits Cook Islands", deck: "Category 5 Xavier hits the Cook Islands at 220 km/h.", art: 11, src: "METSERVICE" },
  { num: 15, cat: "CLIMATE", color: GREEN, head: "COP31 split over phase-out", deck: "Ministers split over the draft's fossil-fuel wording.", art: 12, src: "AFP" },
];
const ALSO: string[] = [
  "Akvan cyclone nears India, landfall 20 Nov",
  "Nvidia posts $115.8B quarter, revenue up 103%",
  "Voyager 1 passes one light-day from Earth",
  "M5.9 earthquake off the coast of Peru",
  "Quad to spend $85M on trusted AI access",
  "APEC CEO Summit draws 115 Fortune 500 firms",
  "St. Johns River nears its 1953 record",
  "Trump meets Marcos at the palace in Manila",
  "Kuwait's first Iranian attack in two months",
  "Bahrain hit a fourth time in six days",
  "Hamas rejects Board of Peace account",
  "Israel rejects Board roadmap; no pullout yet",
  "Latvia: Kulbergs wins confidence vote 57-34",
  "France: 140,000 march, 15,000 detained",
  "M6.0 quake off Papua New Guinea",
  "Dhoni retires from the IPL",
  "Bangladesh: 535 factories shut in protests",
  "GTA VI on sale at midnight in New Zealand",
  "Anthropic prices record $81.3bn IPO",
  "Alcaraz beats Medvedev in Turin",
  "Amnesty: RSF drones killed 37 in Sudan",
  "Ethiopia and Eritrea mass troops on border",
  "US and Venezuela sign defence deal",
  "UK inflation hits 3.6%, a one-year high",
];
const SOURCES =
  "Sources: Reuters, AP, PAHO, WHO, CDC, USGS, MetService NZ, U.S. DOJ, NWS, AFP, BBC, ONS, Amnesty, AAP, ATP. All reports of 18 November 2026.";
const REGION_BAR = "ASIA 7 • EUROPE 8 • AMERICAS 10 • MIDDLE EAST 6 • AFRICA 3 • OCEANIA 2 • WORLD 3";
const NUMBERS_LINE =
  "THE DAY IN NUMBERS:  141 DRONES FIRED • 126 DOWNED • €45BN FOR KYIV • 11,504 EBOLA CASES • 5,412 MEASLES CASES • 144,302 VOTES";
const DATECHECK_1 = "DATE CHECK — EVERYTHING HERE HAPPENED, OR WAS FIRST REPORTED, ON 18 NOVEMBER 2026.";
const DATECHECK_2 =
  "Left out on purpose: the Kerch Bridge collapse and the U.S. strike on Qeshm (both Tue 17 Nov).";
const DATECHECK_3 =
  "Not yet: the Trump-Xi-Putin summit (Thu 19 Nov); Akvan's landfall (Fri 20 Nov).";

// ---------------- illustrations ----------------
function badge(x: number, y: number, n: number): void {
  circle(x, y, 13, RED);
  drawText(String(n), x, y + 6, 16, WHITE, { align: "center", weight: 7 });
}
function dashed(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const segs = Math.floor(len / 11);
  for (let i = 0; i < segs; i += 2) {
    const t0 = i / segs;
    const t1 = Math.min(1, (i + 1) / segs);
    line(x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1, 3, c);
  }
}
function drawGulf(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#16233d"));
  // Stars
  for (const [sx, sy] of [[30, 18], [90, 10], [150, 22], [210, 12], [270, 20], [120, 8], [250, 30], [180, 6], [60, 30], [300, 8]] as [number, number][]) disc(x + sx, y + sy, 1.5, WHITE);
  // Moon over the Gulf
  disc(x + 272, y + 14, 8, GOLD);
  disc(x + 269, y + 12, 7, hex("#16233d"));
  // Airbase: white dome + base + lit doors
  circle(x + 195, y + 80, 24, WHITE);
  fillRect(x + 171, y + 80, 48, 24, hex("#16233d"));
  fillRect(x + 150, y + 80, 90, 8, hex("#c9d4e6"));
  fillRect(x + 184, y + 64, 5, 16, hex("#16233d"));
  fillRect(x + 200, y + 64, 5, 16, hex("#16233d"));
  // Second hangar (small dome) at the left + radar sweep from the main dome
  circle(x + 58, y + 88, 12, hex("#c9d4e6"));
  fillRect(x + 46, y + 88, 24, 10, hex("#c9d4e6"));
  line(x + 195, y + 78, x + 232, y + 48, 2, GREEN);
  disc(x + 232, y + 48, 2, GREEN);
  // Drone flight paths (dashed red) from Qeshm (top-left) to the base
  dashed(x + 20, y + 40, x + 178, y + 66, RED);
  dashed(x + 40, y + 26, x + 208, y + 60, RED);
  dashed(x + 60, y + 52, x + 198, y + 70, RED);
  // Drones: small white crosses with dark bodies
  for (const [dx, dy] of [[96, 52], [128, 42], [150, 62], [180, 34], [210, 48]] as [number, number][]) {
    line(x + dx - 5, y + dy, x + dx + 5, y + dy, 2, WHITE);
    line(x + dx, y + dy - 4, x + dx, y + dy + 4, 2, WHITE);
    disc(x + dx, y + dy, 2, hex("#16233d"));
  }
  // Interception bursts where the paths end
  for (const [bx, by] of [[178, 66], [208, 60], [198, 70]] as [number, number][]) {
    disc(x + bx, y + by, 4, GOLD);
    disc(x + bx, y + by, 2, WHITE);
  }
  drawText("QESHM", x + 38, y + 18, 10, WHITE, { weight: 6, ls: 1 });
  drawText("KUWAIT", x + 252, y + 40, 10, WHITE, { weight: 6, ls: 1 });
  drawText("BAHRAIN", x + 246, y + 84, 10, WHITE, { weight: 6, ls: 1 });
  fillRect(x, y + h - 22, w, 22, RED);
  drawText("ALL INTERCEPTED", x + w / 2, y + h - 7, 12, WHITE, { align: "center", weight: 7, ls: 2 });
}
function drawApec(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, 60, hex("#2b3a55"));
  fillRect(x, y + 60, w, 35, hex("#7a5a7a"));
  fillRect(x, y + 95, w, h - 95, hex("#d98a4b"));
  // Sun over the skyline
  disc(x + 272, y + 34, 13, hex("#f2c94c"));
  // Clouds drifting over the skyline
  disc(x + 40, y + 14, 7, WHITE);
  disc(x + 48, y + 16, 6, WHITE);
  disc(x + 180, y + 12, 6, WHITE);
  disc(x + 120, y + 8, 5, WHITE);
  const towers: [number, number, number][] = [
    [0, 95, 26], [30, 80, 22], [56, 100, 30], [90, 70, 20], [114, 88, 26], [144, 75, 18],
    [166, 98, 28], [198, 82, 24], [226, 68, 20], [250, 92, 26], [280, 78, 32],
  ];
  for (const [tx, ty, tw] of towers) fillRect(x + tx, y + ty, tw, h - ty, hex("#1b1813"));
  for (const [wx, wy] of [[36, 86], [96, 76], [150, 81], [204, 88], [256, 98], [286, 84], [60, 104], [120, 92], [172, 102], [232, 74], [262, 96], [10, 100]] as [number, number][]) fillRect(x + wx, y + wy, 4, 5, hex("#f2c94c"));
  const flag = (fx: number, cols: RGB[]) => {
    line(x + fx, y + 28, x + fx, y + 62, 2, WHITE);
    for (let i = 0; i < 3; i++) fillRect(x + fx + 2, y + 30 + i * 6, 26, 6, cols[i]);
  };
  flag(52, [RED, RED, RED]);
  circle(x + 62, y + 33, 3, hex("#f2c94c"));
  flag(142, [RED, WHITE, RED]);
  fillRect(x + 144, y + 30, 10, 6, hex("#1d4e89"));
  flag(232, [WHITE, BLUE, RED]);
  // Airplane on approach, white side view in front of the skyline
  const py = y + 58;
  fillPoly([[x + 96, py], [x + 186, py], [x + 194, py + 4], [x + 186, py + 8], [x + 96, py + 8]], WHITE);
  fillPoly([[x + 186, py], [x + 208, py - 2], [x + 208, py + 8], [x + 186, py + 8]], WHITE);
  fillPoly([[x + 100, py], [x + 112, py - 14], [x + 120, py - 14], [x + 114, py]], WHITE);
  fillPoly([[x + 144, py + 8], [x + 158, py + 20], [x + 166, py + 20], [x + 156, py + 8]], WHITE);
  for (let i = 0; i < 6; i++) fillRect(x + 116 + i * 11, py + 2, 6, 3, hex("#2b3a55"));
  // Contrail behind the tail + a distant second plane near the sun
  dashed(x + 96, y + 58, x + 12, y + 48, WHITE);
  fillPoly([[x + 238, y + 20], [x + 256, y + 20], [x + 258, y + 22], [x + 256, y + 24], [x + 238, y + 24]], WHITE);
  fillPoly([[x + 244, y + 20], [x + 248, y + 16], [x + 250, y + 16], [x + 248, y + 20]], WHITE);
  // Welcoming party on the tarmac + red carpet (right of the caption)
  fillRect(x + 215, y + 108, 62, 4, RED);
  for (const px of [222, 232, 242, 252, 262]) {
    disc(x + px, y + 99, 2, hex("#1b1813"));
    fillRect(x + px - 2, y + 101, 4, 7, hex("#1b1813"));
  }
  drawText("SHENZHEN  •  21 ECONOMIES", x + 10, y + h - 8, 11, WHITE, { weight: 7, ls: 1 });
}
function drawKerch(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, 52, PAPER);
  fillRect(x, y + 52, w, h - 52, hex("#2e6b8a"));
  drawText("ROAD SPAN DOWN", x + w - 10, y + 18, 12, RED, { align: "right", weight: 7, ls: 1 });
  const deck = hex("#8a8378");
  // Bridge towers + stay cables
  fillRect(x + 60, y + 8, 6, 44, deck);
  fillRect(x + 230, y + 8, 6, 44, deck);
  line(x + 66, y + 12, x + 118, y + 48, 2, deck);
  line(x + 230, y + 12, x + 196, y + 48, 2, deck);
  line(x + 66, y + 20, x + 90, y + 48, 2, deck);
  line(x + 230, y + 20, x + 252, y + 48, 2, deck);
  // Birds over the strait
  line(x + 20, y + 20, x + 24, y + 24, 2, INK);
  line(x + 24, y + 24, x + 28, y + 20, 2, INK);
  line(x + 296, y + 30, x + 300, y + 34, 2, INK);
  line(x + 300, y + 34, x + 304, y + 30, 2, INK);
  // Intact deck (left) + rail span (right)
  fillRect(x, y + 48, 118, 8, deck);
  fillRect(x + 196, y + 48, w - 196, 8, deck);
  fillRect(x + 40, y + 56, 8, 24, deck);
  fillRect(x + 90, y + 56, 8, 24, deck);
  fillRect(x + 222, y + 56, 8, 24, deck);
  fillRect(x + 272, y + 56, 8, 24, deck);
  // Train crossing the intact span
  fillRect(x + 14, y + 34, 84, 12, hex("#1b1813"));
  fillRect(x + 14, y + 34, 16, 12, RED);
  for (let i = 0; i < 4; i++) fillRect(x + 20 + i * 18, y + 38, 10, 5, hex("#dfe7ea"));
  disc(x + 24, y + 48, 3, INK);
  disc(x + 88, y + 48, 3, INK);
  // Collapsed span, tilted into the water
  poly([[x + 118, y + 48], [x + 168, y + 18], [x + 196, y + 48]], 5, deck, false);
  line(x + 196, y + 48, x + 240, y + 92, 5, deck);
  line(x + 210, y + 48, x + 252, y + 96, 5, deck);
  // Red X over the gap
  line(x + 148, y + 44, x + 166, y + 62, 4, RED);
  line(x + 166, y + 44, x + 148, y + 62, 4, RED);
  // Debris floating near the collapsed span + a marker buoy
  fillRect(x + 205, y + 70, 10, 3, deck);
  fillRect(x + 230, y + 82, 8, 3, deck);
  fillRect(x + 250, y + 72, 6, 3, deck);
  disc(x + 282, y + 100, 3, hex("#e8833a"));
  line(x + 282, y + 100, x + 282, y + 92, 2, hex("#e8833a"));
  drawText("KERCH STRAIT", x + 8, y + 108, 9, WHITE, { weight: 6, ls: 1 });
  // Waves (kept inside the 112px panel)
  for (const [wx, wy] of [[40, 88], [120, 104], [220, 92], [280, 106], [100, 100], [180, 108], [150, 96], [60, 94]] as [number, number][]) {
    line(x + wx, y + wy, x + wx + 18, y + wy, 2, WHITE);
  }
}

// ---------------- card illustrations (12 small scenes) ----------------
function cardStrip(x: number, y: number, w: number, h: number, c: RGB, t: string, tc: RGB = WHITE): void {
  fillRect(x, y + h - 13, w, 13, c);
  drawText(t, x + w / 2, y + h - 4, 10, tc, { align: "center", weight: 7, ls: 1 });
}
function artDrones(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#1d2b4a"));
  // City silhouette along the bottom
  for (const [bx, bw, bh] of [[8, 22, 8], [36, 16, 12], [58, 26, 7], [90, 18, 10], [114, 24, 8], [144, 16, 11], [170, 28, 7], [204, 18, 9]] as [number, number, number][]) fillRect(x + bx, y + 23 - bh, bw, bh, hex("#0e1830"));
  // Drone flight paths
  dashed(x + 10, y + 6, x + 90, y + 14, hex("#e8b4b0"));
  dashed(x + 30, y + 4, x + 130, y + 12, hex("#e8b4b0"));
  dashed(x + 60, y + 8, x + 170, y + 16, hex("#e8b4b0"));
  for (const [dx, dy] of [[90, 14], [130, 12], [170, 16]] as [number, number][]) {
    disc(x + dx, y + dy, 3, WHITE);
    line(x + dx - 6, y + dy, x + dx + 6, y + dy, 2, WHITE);
  }
  // One interception burst
  disc(x + 200, y + 10, 4, GOLD);
  disc(x + 200, y + 10, 2, WHITE);
  // Lit windows in the city + a ground line + a fourth drone on its path
  for (const [wx, wy] of [[12, 18], [42, 14], [64, 20], [96, 16], [120, 18], [150, 15], [176, 19], [210, 17]] as [number, number][]) fillRect(x + wx, y + wy, 2, 2, GOLD);
  fillRect(x, y + 23, w, 2, hex("#0e1830"));
  dashed(x + 80, y + 10, x + 200, y + 20, hex("#e8b4b0"));
  disc(x + 200, y + 20, 3, WHITE);
  line(x + 194, y + 20, x + 206, y + 20, 2, WHITE);
  cardStrip(x, y, w, h, RED, "141 FIRED • 126 DOWNED");
}
function artFed(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#efe6c8"));
  // Classical bank: pediment + columns + steps
  fillPoly([[x + 74, y + 2], [x + 96, y + 10], [x + 52, y + 10]], hex("#8a8378"));
  fillRect(x + 52, y + 10, 44, 2, hex("#8a8378"));
  for (const cx of [56, 68, 80]) fillRect(x + cx, y + 12, 5, 9, hex("#8a8378"));
  fillRect(x + 50, y + 21, 48, 2, hex("#8a8378"));
  // Green up arrow (more hikes)
  line(x + 130, y + 20, x + 170, y + 6, 3, GREEN);
  line(x + 170, y + 6, x + 158, y + 6, 3, GREEN);
  line(x + 170, y + 6, x + 170, y + 16, 3, GREEN);
  // Small red down tick for the Dow
  line(x + 180, y + 8, x + 210, y + 18, 3, RED);
  line(x + 210, y + 18, x + 202, y + 18, 3, RED);
  line(x + 210, y + 18, x + 210, y + 10, 3, RED);
  // Steps below the bank + a small tree at the left
  fillRect(x + 44, y + 24, 60, 2, hex("#8a8378"));
  fillRect(x + 38, y + 28, 72, 2, hex("#8a8378"));
  fillRect(x + 20, y + 26, 3, 8, hex("#5a4632"));
  disc(x + 21, y + 22, 7, GREEN);
  disc(x + 14, y + 26, 5, GREEN);
  disc(x + 28, y + 26, 5, GREEN);
  cardStrip(x, y, w, h, GREEN, "DOW -561");
}
function artEu(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, BLUE);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    disc(x + 34 + Math.cos(a) * 10, y + 14 + Math.sin(a) * 9, 1.6, GOLD);
  }
  drawText("€45bn", x + 62, y + 22, 20, WHITE, { weight: 7 });
  // Small Ukraine flag at the right
  fillRect(x + 196, y + 6, 26, 5, hex("#2b6cb0"));
  fillRect(x + 196, y + 11, 26, 5, GOLD);
  // Gold underline under the figure + the year + a small EU flag at the right
  fillRect(x + 62, y + 26, 90, 2, GOLD);
  drawText("2027", x + 160, y + 22, 12, WHITE, { weight: 7 });
  fillRect(x + 196, y + 24, 26, 4, BLUE);
  for (let i = 0; i < 6; i++) disc(x + 198 + i * 4, y + 26, 1, GOLD);
  cardStrip(x, y, w, h, GOLD, "FOR KYIV • 2027", INK);
}
function artJeffries(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#dfe7ea"));
  // Ballot checkbox + green check
  fillRect(x + 14, y + 4, 16, 16, WHITE);
  fillRect(x + 14, y + 4, 16, 2, NAVY);
  fillRect(x + 14, y + 18, 16, 2, NAVY);
  fillRect(x + 14, y + 4, 2, 16, NAVY);
  fillRect(x + 28, y + 4, 2, 16, NAVY);
  line(x + 17, y + 14, x + 22, y + 18, 3, GREEN);
  line(x + 22, y + 18, x + 28, y + 7, 3, GREEN);
  // Vote dot grid: 251 green vs 11 grey (schematic 23 vs 1)
  for (let i = 0; i < 23; i++) disc(x + 44 + (i % 8) * 7, y + 7 + Math.floor(i / 8) * 6, 2, GREEN);
  disc(x + 44 + 7 * 7, y + 19, 2, hex("#8a8378"));
  drawText("251-11", x + 110, y + 20, 16, NAVY, { weight: 7 });
  // The 11 dissenting votes (grey dots) + a podium line + ELECTED tag
  for (let i = 0; i < 11; i++) disc(x + 44 + i * 7, y + 27, 2, hex("#8a8378"));
  fillRect(x + 44, y + 32, 120, 2, NAVY);
  drawText("ELECTED", x + 180, y + 32, 10, GREEN, { weight: 7, ls: 1 });
  cardStrip(x, y, w, h, NAVY, "251-11 • CAUCUS VOTE");
}
function artQuad(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CREAM);
  const flags: RGB[][] = [
    [RED, WHITE, BLUE],
    [hex("#ff9933"), WHITE, GREEN],
    [WHITE, WHITE, WHITE],
    [BLUE, BLUE, BLUE],
  ];
  for (let f = 0; f < 4; f++) {
    const fx = x + 18 + f * 52;
    for (let b = 0; b < 3; b++) fillRect(fx, y + 4 + b * 7, 44, 7, flags[f][b]);
    if (f === 2) disc(fx + 22, y + 14, 5, RED);
    if (f === 3) {
      // Southern Cross: four stars in a cross pattern
      disc(fx + 12, y + 9, 2, WHITE);
      disc(fx + 32, y + 9, 2, WHITE);
      disc(fx + 22, y + 14, 2, WHITE);
      disc(fx + 22, y + 20, 2, WHITE);
    }
  }
  // Manila skyline silhouette along the bottom
  for (const [bx, bw, bh] of [[10, 18, 6], [34, 14, 9], [54, 22, 5], [82, 16, 8], [104, 20, 6], [130, 14, 9], [150, 24, 5], [180, 18, 7], [204, 16, 8]] as [number, number, number][]) fillRect(x + bx, y + 37 - bh, bw, bh, hex("#8a8378"));
  cardStrip(x, y, w, h, BLUE, "MANILA • 4 LEADERS");
}
function artPeltola(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, BLUE);
  // Alaska outline (rough) with a gold star on Anchorage
  fillPoly(
    [[x + 8, y + 18], [x + 14, y + 8], [x + 26, y + 6], [x + 38, y + 10], [x + 44, y + 16], [x + 36, y + 20], [x + 22, y + 22], [x + 10, y + 22]],
    hex("#7fa8d9"),
  );
  disc(x + 30, y + 14, 3, GOLD);
  drawText("56-44", x + 62, y + 22, 20, WHITE, { weight: 7 });
  // Small red/blue vote bars
  fillRect(x + 176, y + 8, 22, 4, RED);
  fillRect(x + 176, y + 14, 18, 4, WHITE);
  // Senate split bars: 56 blue vs 44 red (schematic) + a second star
  fillRect(x + 62, y + 25, 80, 4, BLUE);
  fillRect(x + 62, y + 30, 62, 4, RED);
  drawText("56", x + 148, y + 29, 10, BLUE, { weight: 7 });
  drawText("44", x + 130, y + 34, 10, RED, { weight: 7 });
  disc(x + 200, y + 28, 2, GOLD);
  cardStrip(x, y, w, h, RED, "ALASKA FLIPS");
}
function artGaza(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#d9c9a3"));
  // Ceasefire (yellow) line across the scene
  fillRect(x, y + 18, w, 3, GOLD);
  drawText("NUSEIRAT", x + 8, y + 12, 8, INK, { weight: 6, ls: 1 });
  // Tank crossing the line: turret + barrel + hull + track + wheels
  fillRect(x + 104, y + 2, 22, 6, INK);
  line(x + 126, y + 5, x + 152, y + 2, 3, INK);
  fillRect(x + 88, y + 8, 56, 7, INK);
  fillRect(x + 88, y + 15, 56, 3, INK);
  for (const wx of [94, 108, 122, 136]) disc(x + wx, y + 19, 2.5, INK);
  // Second tank (smaller, below the line) + dust + buildings at the right
  fillRect(x + 16, y + 24, 16, 4, INK);
  fillRect(x + 10, y + 28, 28, 5, INK);
  fillRect(x + 10, y + 33, 28, 2, INK);
  for (const wx of [14, 24, 34]) disc(x + wx, y + 35, 2, INK);
  disc(x + 158, y + 20, 4, hex("#b8a888"));
  disc(x + 168, y + 22, 3, hex("#b8a888"));
  fillRect(x + 180, y + 28, 20, 9, hex("#8a8378"));
  fillRect(x + 206, y + 30, 14, 7, hex("#8a8378"));
  cardStrip(x, y, w, h, RED, "ACROSS THE YELLOW LINE");
}
function artEbola(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PURPLE);
  for (const [vx, vy] of [[50, 13], [120, 10], [180, 15]] as [number, number][]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const len = i % 2 === 0 ? 10 : 6;
      line(x + vx, y + vy, x + vx + Math.cos(a) * len, y + vy + Math.sin(a) * len, 2, hex("#d9c9f2"));
    }
    disc(x + vx, y + vy, 5, hex("#2e1a4a"));
    disc(x + vx, y + vy, 2, hex("#d9c9f2"));
  }
  // A fourth, smaller virion + a red-cross medical marker
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 === 0 ? 7 : 4;
    line(x + 90, y + 28, x + 90 + Math.cos(a) * len, y + 28 + Math.sin(a) * len, 2, hex("#d9c9f2"));
  }
  disc(x + 90, y + 28, 4, hex("#2e1a4a"));
  disc(x + 90, y + 28, 2, hex("#d9c9f2"));
  fillRect(x + 210, y + 26, 12, 4, WHITE);
  fillRect(x + 214, y + 22, 4, 12, WHITE);
  cardStrip(x, y, w, h, hex("#2e1a4a"), "11,504 CASES");
}
function artMeasles(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, TEAL);
  for (const [bx, bh] of [[40, 8], [95, 14], [150, 20]] as [number, number][]) fillRect(x + bx, y + 27 - bh, 30, bh, WHITE);
  // Rising trend line over the bars
  line(x + 30, y + 20, x + 200, y + 6, 3, RED);
  line(x + 200, y + 6, x + 190, y + 6, 3, RED);
  line(x + 200, y + 6, x + 200, y + 14, 3, RED);
  // A fourth, taller bar (2026 is the record year) + the 26-year label
  fillRect(x + 200, y + 27 - 24, 24, 24, WHITE);
  drawText("26 YRS", x + 200, y + 36, 8, WHITE, { weight: 7, ls: 1 });
  cardStrip(x, y, w, h, hex("#0b4f49"), "5,412 CASES");
}
function artAn12(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#7a8a99"));
  // Cargo plane, side view, nose right
  fillPoly([[x + 50, y + 12], [x + 170, y + 12], [x + 182, y + 15], [x + 170, y + 18], [x + 50, y + 18]], INK);
  fillPoly([[x + 52, y + 12], [x + 62, y + 2], [x + 70, y + 2], [x + 66, y + 12]], INK);
  fillPoly([[x + 100, y + 18], [x + 118, y + 22], [x + 126, y + 22], [x + 112, y + 18]], INK);
  for (let i = 0; i < 5; i++) fillRect(x + 84 + i * 14, y + 14, 7, 3, hex("#dfe7ea"));
  // Crash marker: red X at the right
  line(x + 196, y + 6, x + 208, y + 18, 3, RED);
  line(x + 208, y + 6, x + 196, y + 18, 3, RED);
  // Mountains along the bottom + smoke at the crash marker + the place label
  fillPoly([[x + 10, y + 37], [x + 30, y + 26], [x + 50, y + 37]], hex("#5a6a7a"));
  fillPoly([[x + 40, y + 37], [x + 70, y + 24], [x + 100, y + 37]], hex("#5a6a7a"));
  fillPoly([[x + 120, y + 37], [x + 150, y + 28], [x + 180, y + 37]], hex("#5a6a7a"));
  disc(x + 202, y + 22, 5, hex("#dfe7ea"));
  disc(x + 210, y + 26, 4, hex("#dfe7ea"));
  drawText("KEMEROVO", x + 10, y + 36, 8, WHITE, { weight: 7, ls: 1 });
  cardStrip(x, y, w, h, INK, "19 ABOARD");
}
function artXavier(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex("#0f4c5c"));
  // Cyclone spiral: offset rings + gold eye
  ring(x + 114, y + 12, 11, 2, WHITE);
  ring(x + 118, y + 13, 7, 2, WHITE);
  disc(x + 116, y + 12, 2.5, GOLD);
  // Rain bands + island dots
  line(x + 30, y + 6, x + 80, y + 12, 2, WHITE);
  line(x + 150, y + 18, x + 200, y + 8, 2, WHITE);
  disc(x + 60, y + 18, 2, GOLD);
  disc(x + 180, y + 16, 2, GOLD);
  // A second, smaller spiral + more rain bands + island dots
  ring(x + 182, y + 28, 7, 2, WHITE);
  ring(x + 184, y + 29, 4, 2, WHITE);
  disc(x + 183, y + 28, 2, GOLD);
  line(x + 20, y + 30, x + 70, y + 34, 2, WHITE);
  line(x + 140, y + 32, x + 190, y + 26, 2, WHITE);
  disc(x + 100, y + 30, 2, GOLD);
  disc(x + 210, y + 34, 2, GOLD);
  cardStrip(x, y, w, h, hex("#083038"), "220 KM/H • CAT 5");
}
function artCop(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CREAM);
  // Small globe at the left
  disc(x + 24, y + 12, 8, BLUE);
  disc(x + 22, y + 10, 3, GREEN);
  disc(x + 27, y + 15, 2, GREEN);
  // Draft document with text lines + green check
  fillRect(x + 56, y + 3, 56, 20, WHITE);
  fillRect(x + 62, y + 8, 44, 2, hex("#8a8378"));
  fillRect(x + 62, y + 13, 44, 2, hex("#8a8378"));
  fillRect(x + 62, y + 18, 30, 2, hex("#8a8378"));
  disc(x + 150, y + 12, 8, GREEN);
  line(x + 145, y + 12, x + 149, y + 16, 2, WHITE);
  line(x + 149, y + 16, x + 156, y + 7, 2, WHITE);
  // A second document (the draft) + a small globe at the right + the COP label
  fillRect(x + 170, y + 24, 44, 12, WHITE);
  fillRect(x + 175, y + 27, 34, 2, hex("#8a8378"));
  fillRect(x + 175, y + 31, 24, 2, hex("#8a8378"));
  disc(x + 200, y + 12, 6, BLUE);
  disc(x + 198, y + 10, 2, GREEN);
  drawText("COP31", x + 130, y + 34, 10, GREEN, { weight: 7, ls: 1 });
  cardStrip(x, y, w, h, GREEN, "PHASE-OUT?");
}
function drawCardArt(n: number, x: number, y: number, w: number, h: number): void {
  if (n === 1) artDrones(x, y, w, h);
  else if (n === 2) artFed(x, y, w, h);
  else if (n === 3) artEu(x, y, w, h);
  else if (n === 4) artJeffries(x, y, w, h);
  else if (n === 5) artQuad(x, y, w, h);
  else if (n === 6) artPeltola(x, y, w, h);
  else if (n === 7) artGaza(x, y, w, h);
  else if (n === 8) artEbola(x, y, w, h);
  else if (n === 9) artMeasles(x, y, w, h);
  else if (n === 10) artAn12(x, y, w, h);
  else if (n === 11) artXavier(x, y, w, h);
  else if (n === 12) artCop(x, y, w, h);
}

// ---------------- world map ----------------
const CONTINENTS: [number, number][][] = [
  [[-168, 66], [-140, 70], [-120, 72], [-95, 80], [-80, 73], [-75, 62], [-70, 44], [-80, 32], [-90, 21], [-97, 16], [-105, 20], [-115, 30], [-125, 40], [-125, 49], [-145, 60], [-168, 66]],
  [[-80, 10], [-75, 5], [-60, 0], [-50, -5], [-40, -20], [-48, -28], [-58, -35], [-65, -45], [-70, -55], [-73, -40], [-75, -20], [-80, -5], [-80, 10]],
  [[-10, 36], [-5, 44], [-2, 50], [5, 55], [10, 58], [20, 60], [30, 70], [40, 68], [35, 55], [30, 45], [25, 40], [15, 38], [5, 38], [-5, 36]],
  [[-17, 15], [-10, 30], [0, 36], [10, 37], [20, 32], [30, 31], [35, 28], [40, 15], [48, 11], [51, 10], [43, 0], [40, -15], [35, -25], [28, -33], [20, -35], [15, -27], [12, -18], [8, 4], [-8, 5], [-17, 15]],
  [[40, 68], [55, 72], [70, 72], [90, 75], [110, 76], [130, 72], [160, 66], [178, 65], [162, 60], [158, 52], [142, 45], [140, 38], [130, 35], [122, 30], [115, 22], [108, 10], [105, 5], [100, 8], [95, 16], [90, 22], [80, 15], [75, 8], [70, 22], [60, 25], [55, 28], [50, 30], [45, 30], [42, 38], [40, 45], [40, 60]],
  [[113, -22], [122, -14], [132, -12], [142, -11], [150, -22], [153, -28], [150, -37], [140, -38], [130, -32], [120, -34], [113, -26]],
  [[-5, 50], [-2, 53], [-1, 57], [-4, 58], [-6, 54]],
  [[130, 31], [133, 34], [137, 35], [140, 38], [141, 42], [144, 44], [141, 39], [138, 35], [132, 33]],
  [[95, 5], [100, 0], [105, -5], [110, -7], [115, -8], [120, -9], [125, -8], [130, -3], [135, -4], [140, -7], [138, -2], [130, 0], [120, 2], [110, 3], [100, 5]],
];
const DOTS: [number, number, number][] = [
  [53.0, 24.0, 1], [114.0, 22.5, 2], [38.0, 47.0, 3], [26.0, 55.0, 4], [-71.0, 43.0, 5],
  [0.0, 53.0, 6], [-81.0, 35.0, 7], [124.0, 12.0, 8], [-150.0, 64.0, 9], [41.0, 27.0, 10],
  [25.0, -2.0, 11], [-92.0, 29.0, 12], [86.0, 55.4, 13], [-160.0, -21.2, 14], [32.0, 35.0, 15],
];
// Point-in-polygon (ray casting) over a lon/lat polygon.
function inPoly(lon: number, lat: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function drawWorldMap(x: number, y: number, w: number, h: number): void {
  drawText("WHERE IT HAPPENED", x, y + 16, 12, INK, { weight: 6, ls: 1 });
  const mx = x;
  const my = y + 22;
  const mw = w;
  const mh = h - 46;
  fillRect(mx, my, mw, mh, hex("#dfe7ea"));
  const proj = (lon: number, lat: number): [number, number] => [
    mx + ((lon + 180) / 360) * mw,
    my + ((90 - lat) / 150) * mh,
  ];
  // Dotted continents, like the top entries: small dots on a grid, drawn
  // only where the dot falls inside a continent polygon.
  for (let gx = mx + 3; gx < mx + mw; gx += 6) {
    for (let gy = my + 3; gy < my + mh; gy += 6) {
      const lon = ((gx - mx) / mw) * 360 - 180;
      const lat = 90 - ((gy - my) / mh) * 150;
      if (CONTINENTS.some((c) => inPoly(lon, lat, c))) disc(gx, gy, 1.5, hex("#8fa3ab"));
    }
  }
  for (const [lo, la, n] of DOTS) {
    const [dx, dy] = proj(lo, la);
    circle(dx, dy, 7, RED);
    drawText(String(n), dx, dy + 3, 8, WHITE, { align: "center", weight: 7 });
  }
  // Legend: region colors (match the region bar)
  const leg: [string, RGB, number, number][] = [
    ["ASIA", GOLD, 0, 0], ["EUROPE", BLUE, 98, 0], ["AMERICAS", GREEN, 196, 0], ["MIDDLE EAST", RED, 294, 0],
    ["AFRICA", ORANGE, 0, 11], ["OCEANIA", TEAL, 98, 11], ["WORLD", GREY, 196, 11],
  ];
  for (const [name, col, lx, ly] of leg) {
    disc(mx + lx + 4, my + mh + 8 + ly, 3, col);
    drawText(name, mx + lx + 11, my + mh + 11 + ly, 9, INK, { weight: 6 });
  }
}

// ---------------- poster ----------------
function drawPoster(): void {
  fillRect(0, 0, W, H, PAPER);
  // header: dark navy, calendar badge left, gold caps right, big serif date, italic subline
  fillRect(0, 0, W, 118, NAVY);
  fillRect(24, 12, 72, 96, WHITE);
  fillRect(24, 12, 72, 20, RED);
  drawText("NOV", 60, 28, 12, WHITE, { align: "center", weight: 7, ls: 1 });
  drawText("18", 60, 76, 40, NAVY, { align: "center", weight: 7, face: "serif" });
  drawText("WED · 2026", 60, 98, 8, NAVY, { align: "center", weight: 6 });
  drawText("THE DAY IN WORLD NEWS", 110, 20, 13, GOLD, { weight: 7, ls: 2 });
  drawText("39 STORIES • 7 REGIONS • 15 DRAWN • ONE PAGE", 996, 20, 11, GOLD, { align: "right", weight: 6, ls: 1 });
  const dateSize = fitSize("Wednesday 18 November 2026", 886, 46, 0, "serif");
  drawText("Wednesday 18 November 2026", 110, 82, dateSize, WHITE, { weight: 7, face: "serif" });
  drawText("Everything on this page happened, or was first reported, on Wednesday 18 November 2026.", 110, 106, 13, hex("#c9d4e6"), { weight: 5, italic: true });
  // region bar: colored segments, one per region, widths by story count (total 39)
  const regions: [string, number, RGB][] = [
    ["ASIA", 7, GOLD], ["EUROPE", 8, BLUE], ["AMERICAS", 10, GREEN], ["MIDDLE EAST", 6, RED],
    ["AFRICA", 3, ORANGE], ["OCEANIA", 2, TEAL], ["WORLD", 3, GREY],
  ];
  let rx = 28;
  for (const [name, n, col] of regions) {
    const rw = Math.round((968 * n) / 39);
    fillRect(rx, 124, rw, 14, col);
    drawText(name + " " + n, rx + rw / 2, 135, 7, WHITE, { align: "center", weight: 7 });
    rx += rw;
  }
  // numbers line
  const nsz = fitSize(NUMBERS_LINE, 968, 11);
  drawText(NUMBERS_LINE, 28, 152, nsz, INK, { weight: 6 });
  // leads: tall art + kicker + bold serif headline + serif deck
  const leadX = [28, 356, 684];
  const leadCol = [RED, BLUE, BLUE];
  LEADS.forEach((lead, i) => {
    const x = leadX[i];
    if (lead.art === 1) drawGulf(x, 160, 312, 112);
    if (lead.art === 2) drawApec(x, 160, 312, 112);
    if (lead.art === 3) drawKerch(x, 160, 312, 112);
    badge(x + 16, 176, lead.num);
    drawText(lead.kicker, x, 290, 13, leadCol[i], { weight: 7, ls: 2 });
    drawText(lead.src, x + 312, 290, 10, GREY, { align: "right", weight: 6 });
    const hl = drawParaFit(lead.head, x, 312, 312, 19, 21, INK, { weight: 7 }, 2, 16);
    drawParaFit(lead.deck, x, 312 + hl * 21 + 4, 312, 11.5, 13.5, INK, { weight: 5 }, 2, 10);
  });
  fillRect(28, 386, 968, 2, GREY);
  // cards: 3 rows x 4 columns, each with a real illustration panel on top
  const colX = [28, 273, 518, 763];
  const rowY = [392, 516, 640];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const it = GRID[r * 4 + c];
      const x = colX[c];
      const y = rowY[r];
      drawCardArt(it.art, x, y, 233, 50);
      circle(x + 10, y + 62, 9, RED);
      drawText(String(it.num), x + 10, y + 66, 12, WHITE, { align: "center", weight: 7 });
      drawText(it.cat, x + 24, y + 66, 12, it.color, { weight: 7 });
      drawText(it.src, x + 233, y + 66, 9, GREY, { align: "right", weight: 6 });
      const hl = drawParaFit(it.head, x, y + 80, 233, 13.5, 14, INK, { weight: 7 }, 2, 12);
      drawParaFit(it.deck, x, y + 80 + hl * 14 + 2, 233, 10, 10.5, INK, { weight: 5 }, 2, 9);
    }
  }
  fillRect(28, 770, 968, 2, GREY);
  // map + also
  drawWorldMap(28, 776, 392, 170);
  drawText("ALSO ON WEDNESDAY", 436, 794, 13, INK, { weight: 6, ls: 2 });
  for (let i = 0; i < 24; i++) {
    const col = i < 12 ? 0 : 1;
    const row = i % 12;
    const ax = 436 + col * 280;
    const ay = 808 + row * 12.5;
    drawText(String(16 + i), ax + 16, ay, 10, RED, { align: "right", weight: 7 });
    const sz = fitSize(ALSO[i], 256, 10.5);
    drawText(ALSO[i], ax + 22, ay, sz, INK, { weight: 5 });
  }
  // date check box (full red frame)
  fillRect(28, 962, 968, 2, RED);
  fillRect(28, 1002, 968, 2, RED);
  fillRect(28, 962, 2, 42, RED);
  fillRect(994, 962, 2, 42, RED);
  drawText(DATECHECK_1, 40, 976, 10, RED, { weight: 7 });
  drawText(DATECHECK_2, 40, 988, 9.5, INK, { weight: 5 });
  drawText(DATECHECK_3, 40, 999, 9.5, INK, { weight: 5 });
  // footer
  const fs = fitSize(SOURCES, 968, 8.5);
  drawText(SOURCES, 28, 1018, fs, GREY, { weight: 5 });
}

// ---------------- main ----------------
// ---------------- font test sheet ----------------
// Renders both faces at the sizes the poster actually uses, so the font can
// be judged before it goes on the page. Run with "font-test".
function drawFontTest(): void {
  fillRect(0, 0, W, H, PAPER);
  // header preview: navy banner, badge, serif title (as on the poster)
  fillRect(0, 0, W, 118, NAVY);
  fillRect(24, 12, 72, 96, WHITE);
  fillRect(24, 12, 72, 20, RED);
  drawText("NOV", 60, 28, 12, WHITE, { align: "center", weight: 7, ls: 1 });
  drawText("18", 60, 76, 40, NAVY, { align: "center", weight: 7, face: "serif" });
  drawText("WED · 2026", 60, 98, 8, NAVY, { align: "center", weight: 6 });
  drawText("THE DAY IN WORLD NEWS", 110, 20, 13, GOLD, { weight: 7, ls: 2 });
  drawText("39 STORIES • 7 REGIONS • 15 DRAWN • ONE PAGE", 996, 20, 11, GOLD, { align: "right", weight: 6, ls: 1 });
  const dateSize = fitSize("Wednesday 18 November 2026", 886, 46, 0, "serif");
  drawText("Wednesday 18 November 2026", 110, 88, dateSize, WHITE, { weight: 7, face: "serif" });
  drawText("SERIF — TITLE GLYPHS 44PX", 28, 150, 12, GREY, { weight: 7, ls: 1 });
  drawText("Wednesday 18 November 2026", 28, 200, 44, INK, { weight: 7, face: "serif" });
  drawText("SANS — BOLD 36PX", 28, 250, 12, GREY, { weight: 7, ls: 1 });
  drawText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 28, 300, 36, INK, { weight: 7 });
  drawText("abcdefghijklmnopqrstuvwxyz", 28, 350, 36, INK, { weight: 7 });
  drawText("SANS — REGULAR 36PX", 28, 400, 12, GREY, { weight: 7, ls: 1 });
  drawText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 28, 450, 36, INK, { weight: 5 });
  drawText("abcdefghijklmnopqrstuvwxyz", 28, 500, 36, INK, { weight: 5 });
  drawText("HEADLINES — BOLD SANS 19PX", 28, 550, 12, GREY, { weight: 7, ls: 1 });
  drawText("Iran drones hit U.S. bases in Gulf", 28, 585, 19, INK, { weight: 7 });
  drawText("Xi and Putin meet as APEC opens", 28, 615, 19, INK, { weight: 7 });
  drawText("Kerch bridge down; rail back", 28, 645, 19, INK, { weight: 7 });
  drawText("DECKS — REGULAR SANS 11.5PX", 28, 690, 12, GREY, { weight: 7, ls: 1 });
  drawText("Iran fires drones at U.S. bases in Kuwait and Bahrain; all intercepted.", 28, 725, 11.5, INK, { weight: 5 });
  drawText("Xi opens the 33rd APEC meeting of 21 economies and urges free trade.", 28, 745, 11.5, INK, { weight: 5 });
  drawText("DIGITS — BOLD SANS 56PX", 28, 790, 12, GREY, { weight: 7, ls: 1 });
  drawText("0123456789", 28, 850, 56, INK, { weight: 7 });
  drawText("3 vs 5 — 35 53 135 153 305 350", 28, 900, 28, INK, { weight: 6 });
  drawText("€45bn  $81.3bn  251-11  56-44  144,302", 28, 950, 28, INK, { weight: 6 });
  drawText("The quick brown fox jumps over the lazy dog. 1234567890", 28, 1000, 24, INK, { weight: 5 });
}

function main(): void {
  const mode = process.argv[2] || "";
  fillRect(0, 0, W, H, PAPER);
  if (mode === "digit-test") drawDigitTest();
  else if (mode === "font-test") drawFontTest();
  else drawPoster();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), pngEncode());
}
main();
