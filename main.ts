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

// ---------------- vector font (fresh, drawn from scratch) ----------------
// Glyph space: x 0..56, baseline y=0, cap height 70, x-height 48,
// ascender 72, descender -24. Each glyph: [advance, path strings].
// Path language: "M x y L x y ..." — M starts a new stroke.
type Glyph = [number, string[]];
const FONT: Record<string, Glyph> = {
  "0": [60, ["M28,2 L16,6 L8,18 L6,36 L8,54 L16,66 L28,70 L40,66 L48,54 L50,36 L48,18 L40,6 L28,2"]],
  "1": [60, ["M18,56 L30,70 L30,2", "M16,2 L44,2"]],
  "2": [60, ["M10,52 L16,66 L28,70 L40,66 L46,56 L44,44 L34,34 L12,6", "M8,2 L46,2"]],
  "3": [60, ["M14,66 L26,70 L38,66 L44,56 L42,44 L34,36 L24,34", "M24,34 L36,32 L44,24 L42,12 L34,4 L22,2 L12,6"]],
  "4": [60, ["M38,70 L12,24 L44,24", "M38,70 L38,0"]],
  "5": [60, ["M44,70 L12,70 L12,38 L30,38 L42,32 L46,22 L42,10 L30,4 L18,4 L10,10"]],
  "6": [60, ["M44,66 L32,70 L18,64 L10,50 L8,30 L14,12 L26,2 L38,4 L46,14 L46,26 L40,36 L28,36 L18,30 L14,20"]],
  "7": [60, ["M8,70 L48,70 L24,0"]],
  "8": [60, ["M28,70 L18,66 L12,58 L12,46 L18,38 L28,36 L38,38 L44,46 L44,58 L38,66 L28,70", "M28,36 L16,32 L10,22 L10,10 L18,2 L28,0 L38,2 L46,10 L46,22 L40,32 L28,36"]],
  "9": [60, ["M12,52 L18,64 L30,68 L42,64 L48,52 L48,40 L42,30 L30,26 L18,30 L12,40 L12,52", "M46,50 L44,0"]],
  A: [60, ["M6,0 L28,70 L50,0", "M14,26 L42,26"]],
  B: [60, ["M10,0 L10,70 L32,70 L44,62 L44,50 L36,40 L28,36", "M28,36 L38,34 L46,26 L46,12 L38,2 L10,2"]],
  C: [60, ["M46,62 L38,68 L24,70 L12,64 L6,52 L6,20 L12,8 L24,2 L38,4 L46,10"]],
  D: [60, ["M10,0 L10,70 L30,70 L44,62 L50,48 L50,22 L44,8 L30,0 L10,0"]],
  E: [60, ["M46,70 L10,70 L10,0 L46,0", "M10,36 L36,36"]],
  F: [60, ["M10,0 L10,70 L46,70", "M10,36 L36,36"]],
  G: [60, ["M46,62 L38,68 L24,70 L12,64 L6,52 L6,20 L12,8 L24,2 L38,4 L46,10 L46,26 L30,26"]],
  H: [60, ["M10,0 L10,70", "M46,0 L46,70", "M10,36 L46,36"]],
  I: [60, ["M14,70 L42,70", "M28,70 L28,0", "M14,0 L42,0"]],
  J: [60, ["M44,70 L44,10 L38,2 L26,0 L16,4 L12,12"]],
  K: [60, ["M10,0 L10,70", "M46,70 L14,30", "M20,24 L46,0"]],
  L: [60, ["M10,70 L10,0 L46,0"]],
  M: [60, ["M8,0 L8,70 L28,28 L48,70 L48,0"]],
  N: [60, ["M10,0 L10,70 L46,0 L46,70"]],
  O: [60, ["M28,70 L16,66 L8,54 L6,36 L8,18 L16,6 L28,2 L40,6 L48,18 L50,36 L48,54 L40,66 L28,70"]],
  P: [60, ["M10,0 L10,70 L34,70 L46,62 L46,46 L36,36 L10,36"]],
  Q: [60, ["M28,70 L16,66 L8,54 L6,36 L8,18 L16,6 L28,2 L40,6 L48,18 L50,36 L48,54 L40,66 L28,70", "M36,12 L50,-4"]],
  R: [60, ["M10,0 L10,70 L34,70 L46,62 L46,46 L36,36 L10,36", "M30,36 L48,0"]],
  S: [60, ["M44,60 L36,68 L24,70 L12,66 L6,56 L8,44 L16,36 L28,32 L40,28 L48,20 L46,8 L36,2 L24,0 L14,4"]],
  T: [60, ["M6,70 L50,70", "M28,70 L28,0"]],
  U: [60, ["M10,70 L10,16 L16,4 L28,0 L40,4 L46,16 L46,70"]],
  V: [60, ["M8,70 L28,0 L48,70"]],
  W: [60, ["M6,70 L14,0 L28,44 L42,0 L50,70"]],
  X: [60, ["M10,70 L46,0", "M46,70 L10,0"]],
  Y: [60, ["M8,70 L28,36 L48,70", "M28,36 L28,0"]],
  Z: [60, ["M8,70 L48,70 L8,0 L48,0"]],
  a: [60, ["M14,44 L24,48 L36,46 L44,38 L46,26 L40,14 L28,8 L18,10 L12,18 L12,30 L18,40 L28,44", "M46,48 L46,8"]],
  b: [60, ["M12,72 L12,0", "M12,44 L24,48 L36,44 L44,36 L44,22 L36,12 L24,8 L12,12"]],
  c: [60, ["M44,40 L38,46 L26,48 L14,42 L10,30 L10,18 L16,10 L28,6 L40,8 L44,14"]],
  d: [60, ["M12,44 L22,48 L34,44 L42,36 L44,24 L38,12 L26,8 L16,10 L12,18 L12,30 L18,40 L28,44", "M44,72 L44,0"]],
  e: [60, ["M10,24 L44,24 L44,34 L38,44 L26,48 L16,44 L10,34 L10,22 L16,12 L28,8 L38,10 L44,18"]],
  f: [60, ["M22,72 L34,72 L38,62 L38,0", "M10,48 L44,48"]],
  g: [60, ["M12,44 L22,48 L34,44 L42,36 L44,24 L38,12 L26,8 L16,10 L12,18 L12,30 L18,40 L28,44", "M44,48 L44,0 L42,-14 L32,-22 L20,-20 L14,-12"]],
  h: [60, ["M12,72 L12,0", "M12,34 L22,46 L32,48 L40,42 L44,32 L44,0"]],
  i: [28, ["M14,48 L14,2", "M14,70 L14,64"]],
  j: [30, ["M20,48 L20,-12 L16,-20 L10,-22", "M20,70 L20,64"]],
  k: [60, ["M12,72 L12,0", "M42,48 L16,22 L14,20", "M20,26 L42,0"]],
  l: [28, ["M14,72 L14,0"]],
  m: [60, ["M8,0 L8,48", "M8,34 L16,46 L24,48 L30,42 L32,32 L32,0", "M32,34 L40,46 L48,48 L52,42 L54,32 L54,0"]],
  n: [60, ["M10,0 L10,48", "M10,34 L20,46 L32,48 L40,42 L44,32 L44,0"]],
  o: [60, ["M28,48 L18,44 L12,34 L10,22 L14,12 L24,6 L34,6 L44,12 L48,22 L46,34 L40,44 L28,48"]],
  p: [60, ["M12,48 L12,-22", "M12,12 L22,8 L34,10 L42,18 L44,28 L38,40 L26,46 L16,44 L12,36"]],
  q: [60, ["M44,48 L44,-22", "M44,12 L34,8 L22,10 L14,18 L12,28 L18,40 L30,46 L40,44 L44,36"]],
  r: [60, ["M12,0 L12,48", "M12,30 L20,44 L30,48 L38,46"]],
  s: [60, ["M42,40 L34,46 L24,48 L14,44 L10,36 L14,28 L24,24 L34,22 L42,16 L40,8 L32,4 L22,4 L14,8"]],
  t: [36, ["M18,72 L18,2", "M6,46 L32,46"]],
  u: [60, ["M10,48 L10,14 L16,6 L26,4 L36,6 L42,14 L42,48"]],
  v: [60, ["M8,48 L24,0 L40,48"]],
  w: [60, ["M6,48 L14,2 L24,34 L34,2 L42,48"]],
  x: [60, ["M10,48 L42,0", "M42,48 L10,0"]],
  y: [60, ["M8,48 L24,6 L40,48", "M24,6 L18,-18 L14,-22"]],
  z: [60, ["M8,48 L46,48 L10,0 L48,0"]],
  " ": [28, []],
  ".": [28, ["M12,2 L16,2"]],
  ",": [28, ["M12,2 L16,2", "M15,0 L10,-12"]],
  ":": [28, ["M12,30 L16,30", "M12,8 L16,8"]],
  ";": [28, ["M12,30 L16,30", "M13,8 L17,8", "M15,6 L10,-10"]],
  "'": [22, ["M14,68 L10,54"]],
  '"': [40, ["M10,68 L6,54", "M28,68 L24,54"]],
  "!": [28, ["M14,68 L14,18", "M14,2 L16,2"]],
  "?": [60, ["M14,56 L20,66 L30,68 L38,62 L38,52 L30,44 L26,38 L26,28", "M26,2 L28,2"]],
  "-": [34, ["M8,28 L26,28"]],
  "—": [56, ["M4,28 L52,28"]],
  "(": [30, ["M22,70 L14,56 L10,36 L14,16 L22,2"]],
  ")": [30, ["M8,70 L16,56 L20,36 L16,16 L8,2"]],
  "%": [64, ["M14,68 L42,2", "M12,58 L18,64 L24,58 L24,52 L18,46 L12,52 L12,58", "M34,20 L40,26 L46,20 L46,14 L40,8 L34,14 L34,20"]],
  "/": [34, ["M8,0 L26,70"]],
  $: [60, ["M28,76 L28,-6", "M40,56 L32,64 L22,64 L14,56 L12,44 L20,34 L36,30 L44,22 L42,10 L32,4 L22,4 L14,10"]],
  "+": [60, ["M28,14 L28,56", "M10,35 L46,35"]],
  "=": [60, ["M10,26 L46,26", "M10,12 L46,12"]],
  "•": [28, ["M10,26 L18,26", "M10,34 L18,34"]],
};

function parsePath(p: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const t of p.trim().split(/\s+/)) {
    const clean = t.replace(/^[ML]/, "");
    if (!clean) continue;
    const [x, y] = clean.split(",").map(Number);
    pts.push([x, y]);
  }
  return pts;
}
type ParsedGlyph = { adv: number; strokes: [number, number][][] };
const PARSED: Record<string, ParsedGlyph> = {};
for (const ch of Object.keys(FONT)) {
  PARSED[ch] = { adv: FONT[ch][0], strokes: FONT[ch][1].map(parsePath) };
}

function drawGlyph(ch: string, bx: number, by: number, size: number, color: RGB, weight: number): number {
  const g = PARSED[ch];
  if (!g) return size * 0.4;
  const s = size / 70;
  const w = Math.max(1.2, weight * s);
  for (const stroke of g.strokes) {
    for (let i = 0; i + 1 < stroke.length; i++) {
      const [x1, y1] = stroke[i];
      const [x2, y2] = stroke[i + 1];
      line(bx + x1 * s, by - y1 * s, bx + x2 * s, by - y2 * s, w, color);
      // serif ticks on long vertical segments
      if (Math.abs(x1 - x2) <= 1.5 && Math.abs(y1 - y2) >= 35) {
        for (const e of [stroke[i], stroke[i + 1]]) {
          line(bx + (e[0] - 8) * s, by - e[1] * s, bx + (e[0] + 8) * s, by - e[1] * s, w * 0.85, color);
        }
      }
    }
  }
  return g.adv * s;
}

function textWidth(s: string, size: number, ls = 0): number {
  let w = 0;
  for (const ch of s) {
    const g = PARSED[ch];
    w += ((g ? g.adv : 30) * size) / 70 + ls;
  }
  return w - ls;
}
type TextOpts = { weight?: number; ls?: number; align?: "left" | "center" | "right" };
function drawText(s: string, x: number, y: number, size: number, color: RGB, opts: TextOpts = {}): void {
  const ls = opts.ls ?? 0;
  const weight = opts.weight ?? 5;
  const w = textWidth(s, size, ls);
  let bx = x;
  if (opts.align === "center") bx = x - w / 2;
  if (opts.align === "right") bx = x - w;
  for (const ch of s) {
    bx += drawGlyph(ch, bx, y, size, color, weight) + ls;
  }
}
function wrap(s: string, maxW: number, size: number, ls = 0): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, size, ls) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(s: string, x: number, y: number, maxW: number, size: number, lh: number, color: RGB, opts: TextOpts = {}): number {
  const lines = wrap(s, maxW, size, opts.ls ?? 0);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, size, color, opts));
  return lines.length;
}
function fitSize(s: string, maxW: number, size: number, ls = 0): number {
  let sz = size;
  while (sz > 8 && textWidth(s, sz, ls) > maxW) sz -= 1;
  return sz;
}
// Shrink the font (never below minSize) until the text fits in maxLines.
function drawParaFit(s: string, x: number, y: number, maxW: number, size: number, lh: number, color: RGB, opts: TextOpts, maxLines: number, minSize: number): number {
  let sz = size;
  let lines = wrap(s, maxW, sz, opts.ls ?? 0);
  while (lines.length > maxLines && sz > minSize) {
    sz -= 0.5;
    lines = wrap(s, maxW, sz, opts.ls ?? 0);
  }
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, sz, color, opts));
  return lines.length;
}

// ---------------- digit test sheet ----------------
function drawDigitTest(): void {
  fillRect(0, 0, W, H, PAPER);
  drawText("DIGIT TEST", 28, 70, 44, INK, { weight: 7, ls: 2 });
  drawText("18 NOVEMBER 2026", 28, 130, 30, RED, { weight: 6, ls: 1 });
  drawText("WEDNESDAY 18 NOVEMBER 2026", 28, 200, 62, INK, { weight: 7 });
  const digits = "0123456789";
  let x = 28;
  for (const d of digits) {
    drawText(d, x, 330, 110, INK, { weight: 8 });
    x += 100;
  }
  drawText("144,302  50.12%  11,504  5,630  5,412", 28, 430, 44, INK, { weight: 6 });
  drawText("27.5 years  910 hPa  220 km/h  57-34  $115.8B", 28, 500, 40, INK, { weight: 6 });
  drawText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 28, 600, 40, INK, { weight: 6 });
  drawText("abcdefghijklmnopqrstuvwxyz", 28, 660, 40, INK, { weight: 6 });
  drawText("The quick brown fox jumps over the lazy dog. 1234567890", 28, 730, 30, INK, { weight: 5 });
  drawText("Gulf drones hit U.S. bases; all intercepted.", 28, 790, 30, INK, { weight: 5 });
}

// ---------------- content (all facts verified against primary sources) ----------------
type Lead = { num: number; kicker: string; head: string; deck: string; art: number };
const LEADS: Lead[] = [
  {
    num: 1,
    kicker: "THE GULF",
    head: "Iran drones hit U.S. bases in Gulf",
    deck: "Tehran fires drones at Ali Al Salem in Kuwait and Sheikh Isa in Bahrain, a day after U.S. jets hit Qeshm. All are intercepted.",
    art: 1,
  },
  {
    num: 2,
    kicker: "SHENZHEN",
    head: "Xi and Putin meet as APEC opens",
    deck: "Xi opens the 33rd APEC leaders' meeting of 21 economies and urges free trade, a day before the first Trump-Xi-Putin talks.",
    art: 2,
  },
  {
    num: 3,
    kicker: "CRIMEA",
    head: "Kerch bridge down; rail back",
    deck: "Ukraine's two nights of strikes drop the road span into the strait. Russia says trains run again; rebuilding may take 2 years.",
    art: 3,
  },
];
type GridItem = { num: number; cat: string; color: RGB; head: string; deck: string };
const GRID: GridItem[] = [
  { num: 4, cat: "QUAD", color: BLUE, head: "Leaders meet in Manila", deck: "Trump, Modi, Takaichi, Albanese agree a forum, a patrol drill, minerals deals." },
  { num: 5, cat: "U.S. SENATE", color: BLUE, head: "Peltola flips Alaska", deck: "Peltola beats Sullivan 144,302 to 131,844; Democrats take a 56-44 Senate." },
  { num: 6, cat: "GAZA", color: RED, head: "Ceasefire near collapse", deck: "Board of Peace: both sides failing the deal; 1,600+ killed since 2025." },
  { num: 7, cat: "EBOLA", color: PURPLE, head: "Congo toll: 11,504 cases", deck: "11,504 cases, 5,630 deaths to 16 Nov; Africa CDC: 'still out of control'." },
  { num: 8, cat: "HEALTH", color: TEAL, head: "U.S. loses measles-free status", deck: "PAHO ends 26 years of elimination; 5,412 cases, the most since 1991." },
  { num: 9, cat: "RUSSIA", color: INK, head: "An-12 crash kills all 19 aboard", deck: "A military An-12 falls near Kemerovo; a criminal case opens on 18 Nov." },
  { num: 10, cat: "WEATHER", color: BLUE, head: "Cyclone Xavier hits Cook Islands", deck: "Category 5 Xavier hits the Cook Islands at 220 km/h; shelter urged." },
  { num: 11, cat: "FLORIDA", color: ORANGE, head: "Floods shut schools", deck: "Up to 15 inches of rain in Broward; rescues, I-95 shut, emergency declared." },
  { num: 12, cat: "JUSTICE", color: INK, head: "27.5 years for Trump plot", deck: "Merchant, 48, gets 330 months for an Iran-backed plot to kill Donald Trump." },
  { num: 13, cat: "LATVIA", color: GREEN, head: "Kulbergs wins confidence vote", deck: "Saeima backs Kulbergs' government 57-34; 2.9 billion euros saved by 2030." },
  { num: 14, cat: "FRANCE", color: PURPLE, head: "140,000 march in pay strike", deck: "Unions call a public-sector strike over pay; 15,000 detained in recent weeks." },
  { num: 15, cat: "QUAKES", color: ORANGE, head: "M6.0 shakes Papua New Guinea", deck: "M6.0 quake at 10 km depth; a 5.3 in Romania is felt in Bucharest, 2 hurt." },
  { num: 16, cat: "SPORT", color: GREEN, head: "Dhoni retires from the IPL", deck: "Dhoni, 45, ends his playing career; CSK mentor from 2027. 278 matches, 5 titles." },
];
const ALSO: string[] = [
  "Akvan cyclone nears India, landfall 20 Nov",
  "Trump claims big Philippines trade deal",
  "Nvidia posts $115.8B quarter, revenue up 103%",
  "Voyager 1 passes one light-day from Earth",
  "M5.9 earthquake off the coast of Peru",
  "Katz: IDF ready to seize more Gaza ground",
  "Quad to spend $85M on trusted AI access",
  "APEC CEO Summit draws 115 Fortune 500 firms",
  "St. Johns River at Cocoa in major flood",
  "Trump meets Marcos at the palace in Manila",
  "Kuwait's first Iranian attack in two months",
  "Bahrain hit for the third time in five days",
  "Quad business forum to be held in Mumbai, 2027",
  "France: Senate takes up 2027 budget on 20 Nov",
  "Hamas rejects Board of Peace account",
  "Israel rejects Board roadmap; no pullout yet",
];
const SOURCES =
  "Sources: Reuters, Associated Press, PAHO, WHO, CDC, USGS, MetService NZ, U.S. Dept. of Justice, CSK, NWS, AFP. Compiled from reports of 18 November 2026.";

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
  fillRect(x, y, w, h, hex("#1d4e89"));
  fillPoly(
    [[x + 150, y], [x + w, y], [x + w, y + 55], [x + 262, y + 48], [x + 212, y + 60], [x + 182, y + 40], [x + 162, y + 20]],
    hex("#d9c9a3"),
  );
  fillPoly(
    [[x + 180, y + h], [x + w, y + h], [x + w, y + 80], [x + 282, y + 88], [x + 242, y + 100], [x + 212, y + 118]],
    hex("#d9c9a3"),
  );
  circle(x + 200, y + 42, 6, hex("#d9c9a3"));
  drawText("QESHM", x + 210, y + 46, 10, WHITE, { weight: 6, ls: 1 });
  dashed(x + 150, y + 30, x + 252, y + 84, RED);
  dashed(x + 150, y + 38, x + 212, y + 92, RED);
  circle(x + 252, y + 84, 5, WHITE);
  circle(x + 252, y + 84, 3, RED);
  circle(x + 212, y + 92, 5, WHITE);
  circle(x + 212, y + 92, 3, RED);
  drawText("KUWAIT", x + 262, y + 88, 10, WHITE, { weight: 6, ls: 1 });
  drawText("BAHRAIN", x + 222, y + 108, 10, WHITE, { weight: 6, ls: 1 });
  fillRect(x, y + h - 22, w, 22, RED);
  drawText("ALL INTERCEPTED", x + w / 2, y + h - 7, 12, WHITE, { align: "center", weight: 7, ls: 2 });
}
function drawApec(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, 60, hex("#2b3a55"));
  fillRect(x, y + 60, w, 35, hex("#7a5a7a"));
  fillRect(x, y + 95, w, h - 95, hex("#d98a4b"));
  const towers: [number, number, number][] = [
    [0, 95, 26], [30, 80, 22], [56, 100, 30], [90, 70, 20], [114, 88, 26], [144, 75, 18],
    [166, 98, 28], [198, 82, 24], [226, 68, 20], [250, 92, 26], [280, 78, 32],
  ];
  for (const [tx, ty, tw] of towers) fillRect(x + tx, y + ty, tw, h - ty, hex("#1b1813"));
  const flag = (fx: number, cols: RGB[]) => {
    line(x + fx, y + 28, x + fx, y + 62, 2, WHITE);
    for (let i = 0; i < 3; i++) fillRect(x + fx + 2, y + 30 + i * 6, 26, 6, cols[i]);
  };
  flag(52, [RED, RED, RED]);
  circle(x + 62, y + 33, 3, hex("#f2c94c"));
  flag(142, [RED, WHITE, RED]);
  fillRect(x + 144, y + 30, 10, 6, hex("#1d4e89"));
  flag(232, [WHITE, BLUE, RED]);
  drawText("SHENZHEN  •  21 ECONOMIES", x + 10, y + h - 8, 11, WHITE, { weight: 7, ls: 1 });
}
function drawKerch(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, 52, PAPER);
  fillRect(x, y + 52, w, h - 52, hex("#2e6b8a"));
  drawText("ROAD SPAN DOWN", x + w - 10, y + 18, 12, RED, { align: "right", weight: 7, ls: 1 });
  const deck = hex("#8a8378");
  fillRect(x, y + 48, 118, 8, deck);
  fillRect(x + 196, y + 48, w - 196, 8, deck);
  fillRect(x + 40, y + 56, 8, 24, deck);
  fillRect(x + 90, y + 56, 8, 24, deck);
  fillRect(x + 222, y + 56, 8, 24, deck);
  fillRect(x + 272, y + 56, 8, 24, deck);
  poly([[x + 10, y + 48], [x + 60, y + 18], [x + 110, y + 48]], 5, deck, false);
  line(x + 196, y + 48, x + 240, y + 92, 5, deck);
  line(x + 210, y + 48, x + 252, y + 96, 5, deck);
  line(x + 148, y + 44, x + 166, y + 62, 4, RED);
  line(x + 166, y + 44, x + 148, y + 62, 4, RED);
  for (const [wx, wy] of [[40, 92], [120, 108], [220, 96], [280, 116], [80, 122], [180, 118]] as [number, number][]) {
    line(x + wx, y + wy, x + wx + 18, y + wy, 2, WHITE);
  }
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
  [56.3, 26.9, 1], [114.1, 22.5, 2], [36.4, 45.3, 3], [121.0, 14.6, 4], [-150.0, 64.0, 5],
  [34.5, 31.4, 6], [25.0, -2.0, 7], [-98.0, 39.5, 8], [86.0, 55.4, 9], [-160.0, -21.2, 10],
  [-81.5, 27.5, 11], [-74.0, 40.7, 12], [24.1, 56.9, 13], [2.3, 46.6, 14], [147.0, -6.5, 15],
  [26.0, 45.7, 15], [80.3, 13.1, 16],
];
function drawWorldMap(x: number, y: number, w: number, h: number): void {
  drawText("WHERE IT HAPPENED", x, y + 20, 15, INK, { weight: 6, ls: 2 });
  const mx = x;
  const my = y + 28;
  const mw = w;
  const mh = h - 28;
  fillRect(mx, my, mw, mh, hex("#dfe7ea"));
  const proj = (lon: number, lat: number): [number, number] => [
    mx + ((lon + 180) / 360) * mw,
    my + ((90 - lat) / 150) * mh,
  ];
  for (const cont of CONTINENTS) {
    fillPoly(cont.map(([lo, la]) => proj(lo, la)), hex("#aab8bd"));
  }
  for (const [lo, la, n] of DOTS) {
    const [dx, dy] = proj(lo, la);
    circle(dx, dy, 8, RED);
    drawText(String(n), dx, dy + 4, 10, WHITE, { align: "center", weight: 7 });
  }
}

// ---------------- poster ----------------
function drawPoster(): void {
  fillRect(0, 0, W, H, PAPER);
  // header
  fillRect(0, 0, W, 160, NAVY);
  drawText("WORLD EDITION", 28, 36, 15, WHITE, { weight: 6, ls: 3 });
  drawText("ONE DAY • ONE PAGE", 996, 36, 15, WHITE, { weight: 6, ls: 3, align: "right" });
  const dateSize = fitSize("WEDNESDAY 18 NOVEMBER 2026", 968, 64);
  drawText("WEDNESDAY 18 NOVEMBER 2026", 28, 118, dateSize, WHITE, { weight: 7 });
  fillRect(28, 132, 968, 3, GOLD);
  drawText("THE WORLD'S NEWS, SUMMED UP IN ONE PICTURE", 512, 156, 15, hex("#c9d4e6"), { align: "center", ls: 2, weight: 5 });
  // leads
  const leadX = [28, 356, 684];
  LEADS.forEach((lead, i) => {
    const x = leadX[i];
    if (lead.art === 1) drawGulf(x, 172, 312, 132);
    if (lead.art === 2) drawApec(x, 172, 312, 132);
    if (lead.art === 3) drawKerch(x, 172, 312, 132);
    badge(x + 16, 188, lead.num);
    drawText(lead.kicker, x, 326, 13, RED, { weight: 6, ls: 2 });
    const hl = drawPara(lead.head, x, 354, 312, 25, 29, INK, { weight: 7 });
    drawParaFit(lead.deck, x, 354 + hl * 29 + 8, 312, 14, 19, INK, { weight: 5 }, 4, 12);
  });
  fillRect(28, 476, 968, 2, GREY);
  // grid: 3 columns, 5 + 4 + 4 items
  const colX = [28, 356, 684];
  const colCounts = [5, 4, 4];
  let gi = 0;
  for (let c = 0; c < 3; c++) {
    const count = colCounts[c];
    const itemH = 272 / count;
    for (let j = 0; j < count; j++) {
      const it = GRID[gi++];
      const iy = 488 + j * itemH;
      const x = colX[c];
      circle(x + 11, iy + 12, 11, RED);
      drawText(String(it.num), x + 11, iy + 17, 14, WHITE, { align: "center", weight: 7 });
      const catW = textWidth(it.cat + "  ", 15, 0);
      drawText(it.cat, x + 28, iy + 18, 15, it.color, { weight: 7 });
      const hs = fitSize(it.head, 312 - 28 - catW, 15);
      drawText(it.head, x + 28 + catW, iy + 18, hs, INK, { weight: 7 });
      drawParaFit(it.deck, x + 28, iy + 36, 284, 11.5, 14, INK, { weight: 5 }, 2, 10);
    }
  }
  // map + also
  drawWorldMap(28, 772, 392, 212);
  drawText("ALSO ON WEDNESDAY", 436, 792, 15, INK, { weight: 6, ls: 2 });
  for (let i = 0; i < 16; i++) {
    const col = i < 8 ? 0 : 1;
    const row = i % 8;
    const ax = 436 + col * 280;
    const ay = 820 + row * 22;
    drawText("•", ax, ay, 12, RED, { weight: 6 });
    const sz = fitSize(ALSO[i], 250, 12);
    drawText(ALSO[i], ax + 14, ay, sz, INK, { weight: 5 });
  }
  // footer
  const fs = fitSize(SOURCES, 968, 10.5);
  drawText(SOURCES, 28, 1012, fs, GREY, { weight: 5 });
}

// ---------------- main ----------------
function main(): void {
  const mode = process.argv[2] || "";
  fillRect(0, 0, W, H, PAPER);
  if (mode === "digit-test") drawDigitTest();
  else drawPoster();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), pngEncode());
}
main();
