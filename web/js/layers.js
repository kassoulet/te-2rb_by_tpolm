// layers.js - the 2D layers of te-2rb: texture loader (slides = TGA>>2, fonts), additive sprite blit (0x1de34), random digits (0x1e078),
// and the palette chain (0x1e63c: pulse 0x1eabc, fade scale 0x1eb70, flash 0x1ecc8). Frame buffer = 640*480 bytes, additive mod 256.
// Display grey of a byte b = 4 * dac[b], dac = the 6-bit palette written by 0x1e63c.
export const W = 640, H = 480, WH = W * H;
const isNode = typeof window === 'undefined';
const F = Math.fround;

// ---- textures ----
async function nodePng(buf) {                       // 8-bit grayscale non-interlaced PNG
  const zlib = await import('zlib'); let p = 8, w = 0, h = 0; const idat = [];
  while (p < buf.length) { const n = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); } else if (t === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + n));
    p += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (w + 1)], o = y * w, s = y * (w + 1) + 1;
    for (let x = 0; x < w; x++) { const a = x ? out[o + x - 1] : 0, b = y ? out[o - w + x] : 0, c = x && y ? out[o - w + x - 1] : 0; let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + x] = v; } }
  return { w, h, d: out };
}
async function grey(rel) {                          // -> {w,h,d} raw 0..255
  const url = new URL('../data/tex/' + rel, import.meta.url);
  if (isNode) return nodePng((await import('fs')).readFileSync(url));
  const im = new Image(); im.src = url; await im.decode();
  const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, im.width, im.height).data, d = new Uint8Array(im.width * im.height);
  for (let i = 0; i < d.length; i++) d[i] = px[4 * i];
  return { w: im.width, h: im.height, d };
}
const cache = new Map();
// slide / sprite / font object: {w,h,d} with d = png>>2 (the demo shifts every texture right by 2)
export function tex(rel) {
  if (!cache.has(rel)) cache.set(rel, grey(rel + '.png').then((o) => { for (let i = 0; i < o.d.length; i++) o.d[i] >>= 2; return o; }));
  return cache.get(rel);
}
export const font = (c) => tex('fonts/' + c);

// ---- blits ----
// 0x1de34: acc[(y+j)*640 + x+i] += d for non-zero d (no clipping in the original: out of range is fatal; we just skip)
export function sprite(acc, o, x, y) {
  for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) { const v = o.d[j * o.w + i], p = (y + j) * W + x + i; if (v && p >= 0 && p < WH) acc[p] = (acc[p] + v) & 255; }
}
export const copySlide = (acc, s) => { acc.set(s.d); };
export const addSlide = (acc, s) => { for (let i = 0; i < WH; i++) acc[i] = (acc[i] + s.d[i]) & 255; };
// 0x1e078: n printed with %d, left padded to 5 with '0' glyphs, 61 px per char
export function digits(acc, n, x, y, fonts) {
  const s = String(n).padStart(5, '0').slice(0, 5);   // the loops stop at column 5: a 6 digit number loses its last digit
  for (let i = 0; i < s.length; i++) sprite(acc, fonts[s.charCodeAt(i) - 48], x + 61 * i, y);
}
export const loadDigits = () => Promise.all([...'0123456789'].map(font));

// ---- palette ----
// base palette: 768 bytes, entry e (3 equal channels) = min(e,63)
const base = new Uint8Array(768); for (let i = 0; i < 768; i++) base[i] = Math.min(i / 3 | 0, 63);
const clamp = (v) => (v <= 63 ? Math.trunc(v) : 63);
function pulse(clk) {                               // 0x1eabc
  const f = F(Math.sin(F(clk * 0.04)) * 0.3 + 0.8), w = new Uint8Array(768);
  for (let i = 0; i < 768; i++) w[i] = clamp(F(base[i] * f));
  return w;
}
export class Palette {                              // holds the flash state of 0x1ecc8 (arg -7)
  constructor() { this.reset(); }
  reset() { this.scale = 1; }
  // dac table (768) for call 0x1e63c(arg) at demo clock clk; row = music row (flash only)
  dac(arg, clk, row) {
    if (arg === -7) {                                 // this.scale is set by the caller (scenes_2d.flashScale)
      const w = new Uint8Array(768); for (let i = 0; i < 768; i++) w[i] = clamp(F(base[i] * this.scale)); return w;
    }
    if (arg === -6) {                                 // 0x1ebec (S7): scale = 0.6 + 0.6 cos^3((dt*3.1415 + 402.112)/128), dt = clk - this.clk0 (scene entry clock); every store float32
      const x = F(((clk - this.clk0) * 3.1415 + 402.112) * 0.0078125), c = F(Math.cos(x)), c3 = F(F(c * c) * c), s = F(c3 * 0.6 + 0.6), w = new Uint8Array(768);
      for (let i = 0; i < 768; i++) { const v = F(base[i] * s); w[i] = v > 63 ? 63 : Math.trunc(v); }
      return w;
    }
    if (arg === 0) return pulse(clk);
    if (arg > 64) return base.slice();
    const w = pulse(clk), s = F((65 - arg) * 0.015625);
    for (let i = 0; i < 768; i++) w[i] = Math.trunc(F(w[i] * s)) & 63;   // arg < 0 (S10) brightens above 63: byte store + 6-bit DAC wrap
    return w;
  }
}
// 256-entry display grey from a dac table (grey = 4 * channel; channels are equal)
export const greyOf = (dac) => { const g = new Uint8Array(256); for (let i = 0; i < 256; i++) g[i] = 4 * dac[3 * i]; return g; };
// palette in force before the first 0x1e63c call (frame 0 only): the identity ramp, 6 bit wrapped
export const initDac = () => { const d = new Uint8Array(768); for (let i = 0; i < 768; i++) d[i] = (i / 3 | 0) & 63; return d; };
