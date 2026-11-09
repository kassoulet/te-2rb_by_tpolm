// scenes_2d.js - the 2D compositor of te-2rb for the first 1700 frames of the golden run (orders 0..~16), as a pure function of the frame index (3D layers: hooks).
// Frame k <-> demo clock 7k ticks (70 Hz), music time k/10 s. Bit-exact (0 differing pixels) against re/golden (0..1199) and re/golden_b (1200..1699), see re/NOTES.md.
// The 3D layers are plugged through `hooks.sN = (acc, clk) => {add the 3D layer into acc, mod 256}` (S7: (acc, clk, mode)); all are set below.
import {W, H, WH, tex, sprite, addSlide, copySlide, digits, loadDigits, Palette, greyOf, initDac} from './layers.js';
import {grainForFrame, grainA} from './noise.js';
import {layer as tvLayer} from './scenes_3d.js';
import {drawDo} from './scene_do.js';
import {s3 as s3Layer, s4 as s4Layer, s5 as s5Layer} from './scenes_3d_b.js';
import {pallo as palloLayer, exe as exeLayer} from './scenes_3d_c.js';
import {bom as bomLayer} from './scenes_3d_d.js';
import {s9 as s9Layer, s10 as s10Layer} from './scenes_3d_e.js';
import {s11 as s11Layer, s12 as s12Layer} from './scenes_3d_f.js';
const isNode = typeof window === 'undefined';
const rows = JSON.parse(isNode ? (await import('fs')).readFileSync(new URL('../data/xmrows.json', import.meta.url), 'utf8') : await (await fetch(new URL('../data/xmrows.json', import.meta.url))).text());

export const hooks = {s2: drawDo, s3: s3Layer, s4: s4Layer, s5: s5Layer, s6: palloLayer, s7: exeLayer, s8: bomLayer, s9: s9Layer, s10: s10Layer, s11: s11Layer, s12: s12Layer};   // 3D layers of the later scenes (external); null = missing, the 2D part still renders
export const START = [0, 120, 423, 549, 820, 1080, 1364, 1669, 2048, 2260, 2468, 2671, 2772];   // first loop iteration of S0..S7 (displayed black, except frame 0)
export const FRAMES = 3005;
// S10 (0x20674): the iteration whose gate sees order*64+row > 1604 (25.5) stores clk_first (the clock AFTER that frame's present = 7*(j+1)); a8 is then (clk - clk_first)*0.002 for the frames after
export const CLK_A8 = (() => { for (let j = 2468; ; j++) { const [o, r] = pos(j + 1); if (o * 64 + r > 1604) return 7 * (j + 1); } })();
export const sceneOf = (k) => { let s = 0; while (s + 1 < START.length && k >= START[s + 1]) s++; return s; };

export function pos(k) {                                        // [order,row] seen by the gate/fade code at frame k
  if (k === 0) return [0, 1];                                   // the very first frame already sees row 1
  const t = 7 * k / 70; let lo = 0, hi = rows.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rows[m][2] <= t) lo = m; else hi = m - 1; }
  return [rows[lo][0], rows[lo][1]];
}

// S0 (0x1edb0): apup slide index + fade arg by order/row (ranges are [from,to))
const S0 = [[0, 3, 0, 1], [3, 6, 0, 20], [6, 10, 0, 42], [10, 13, 1, 1], [13, 16, 1, 20], [16, 20, 1, 42], [20, 23, 2, 1], [23, 26, 2, 20], [26, 28, 2, 43],
  [28, 31, 3, 1], [31, 34, 3, 20], [34, 36, 3, 43], [36, 39, 4, 1], [39, 42, 4, 20], [42, 54, 4, 43], [54, 57, 5, 1], [57, 60, 5, 20], [60, 99, 5, 43]];
export function s0(order, row) {                                // -> [apup index, arg]
  if (order === 0) { for (const [a, b, s, g] of S0) if (row >= a && row < b) return [s, g]; return [5, 43]; }
  if (order === 1) return [6, row < 3 ? 1 : row < 6 ? 20 : row < 10 ? 43 : 0];
  return [6, 0];
}
// fade argument given to 0x1e63c at the end of a loop iteration of scene s (see 0x1f604 / 0x1f7c4 / 0x1f990)
export function argOf(s, o, r) {
  switch (s) {
    case 0: return s0(o, r)[1];
    case 1: return 0;
    case 2: return -7;
    case 3: return o === 7 && r >= 0x16 ? Math.trunc(1 + (r - 0x16) * 1.5238095238095237) : 0;
    case 4: return o === 10 && r >= 3 ? Math.trunc(1 + (r - 3) * 2.0) : 0;
    case 5: return o === 13 && r >= 0 ? Math.trunc(1 + r * 3.2) : 0;
    case 6: return o === 16 && r >= 0 ? Math.trunc(1 + r * 3.3684210526315788) : 0;   // 0x1fe5b: (1 + row*3.368), order 16 (= fade out over rows 0..18)
    case 8: return o === 21 && r >= 0x30 ? Math.trunc(1 + (r - 0x30) * 3.2) : o === 22 && r <= 4 ? Math.trunc(1 + (r + 16) * 3.0476190476190474) : 0;   // S8 (0x20226..): fade out at the end of order 21, fade in again at order 22 rows 0..4
    case 9: return o === 23 && r >= 0x32 ? Math.trunc(1 + (r - 0x32) * 3.0476190476190474) : o === 24 && r <= 6 ? Math.trunc(1 + (r + 14) * 3.0476190476190474) : 0;   // S9 (0x2043e..): fade out at the end of order 23, hold until 24.6
    case 10: return o === 25 && r >= 4 || o === 26 && r <= 5 ? Math.trunc(1 + (r - 0x1c) * 0.9846153846153847) : 0;   // S10 (0x20673..): arg 0 until order 25 row 4 (then 1+(row-0x1c)*0.9846, unverified/not needed before frame 2500)
    case 11: return o === 27 ? Math.trunc(1 + r * 16) : 0;   // S11 (0x20888..): fade out over order 27 rows 0..3 (1+row*16, 0x1016d9)
    case 12: return o === 29 ? Math.trunc(1 + r * 2.909090909090909) : 0;   // S12 (0x20a4c..): fade out at order 29 (0x1016f1), end not verified (> frame 2799)
    default: return o === 19 && r >= 0x2c ? Math.trunc(1 + (r - 0x2c) * 3.0476190476190474) : -6;   // S7 (0x2005f..): palette flicker (-6) until order 19 row 0x2c, then fade out
  }
}
const FLASH = [0, 4, 8, 0xb, 0x13, 0x16, 0x26, 0x28, 0x3b];    // 0x1ecc8: rows that restart the flash at x2
export function flashScale(k) {                                 // scale used by the flash call of frame k (state replayed from S2's first iteration)
  let s = 1; for (let j = START[2]; j <= k; j++) s = FLASH.includes(pos(j + 1 - LAG[2])[1]) ? 2 : Math.fround(Math.sqrt(s)); return s;
}
// grey table in force when frame k is shown: palette set by the 0x1e63c call at the end of iteration k-1 (clock already advanced to 7k)
export const LAG = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function greyAt(k) {
  if (k === 0) return greyOf(initDac());
  const s = sceneOf(k - 1), [o, r] = pos(k - LAG[s]), arg = argOf(s, o, r), p = new Palette();
  if (arg === -7) p.scale = s === 2 ? flashScale(k - 1) : 2;   // S10 reaches -7 once (row 0x13, in the FLASH list of 0x1ed01.. -> scale 2.0)
  if (arg === -6) p.clk0 = 7 * START[7];
  return greyOf(p.dac(arg, 7 * k, r));
}

// ---- per scene buffers (the framebuffer "acc" before the palette) ----
const addRect = (acc, L, x0, y0, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (y0 + y) * W + x0 + x; acc[p] = (acc[p] + L[y * w + x]) & 255; } };
const S7SLIDE = ['cred1', 'cred2', 'cred3', 'cred4', 'cred5', 'cred6', 'cred7', 'cred8', 'love', 'love', 'love'];
const st = {};                                                  // S4/S6 keep the previous frame (halving blur): replay forward, restart on a backward seek
async function trail(s, k, slide, draw) {                       // buf = (buf + slide) >> 1, then the 3D layers are added in place (0x1fc28 loop / S4's)
  const d = (await tex(slide)).d, t = st[s];
  if (t && t.k === k) return t.acc.slice();
  const from = t && t.k >= START[s] && t.k < k ? t.k + 1 : START[s];
  let cur = from === START[s] ? await accOf(START[s] - 1) : t.acc;                          // previous scene's last buffer feeds the first averaging
  for (let j = from; j <= k; j++) { for (let i = 0; i < WH; i++) cur[i] = (cur[i] + d[i]) >> 1; draw?.(cur, 7 * j); st[s] = {k: j, acc: cur.slice()}; }
  return cur;
}
export async function accOf(k) {
  const s = sceneOf(k), clk = 7 * k, acc = new Uint8Array(WH);
  if (s === 0) { const [o, r] = pos(k); grainForFrame(acc, k); addSlide(acc, await tex('apup' + (s0(o, r)[0] + 1))); }
  else if (s === 1) {
    grainForFrame(acc, k); addSlide(acc, await tex('alku')); addRect(acc, tvLayer(clk), 189, 55, 273, 300);
    digits(acc, Number(BigInt.asUintN(32, BigInt(clk >> 2) * 0x23ec3fn) % 0xf423fn), 190, 377, await loadDigits());   // 0x1e078
  } else if (s === 2) { grainForFrame(acc, k); addSlide(acc, await tex('donot')); hooks.s2?.(acc, clk); }
  else if (s === 3) { copySlide(acc, await tex('500yr')); const o = await tex('8996'); sprite(acc, o, 0, H - o.h); hooks.s3?.(acc, clk); }
  else if (s === 4) acc.set(await trail(4, k, 'kikka1', hooks.s4));
  else if (s === 5) { copySlide(acc, await tex('odwar')); const o = await tex('6998'); sprite(acc, o, W - o.w, 0); hooks.s5?.(acc, clk); }
  else if (s === 6) acc.set(await trail(6, k, 'middle', hooks.s6));
  else if (s === 8) { grainA(acc, k, START[8]); const o = await tex('6998'); sprite(acc, o, W - o.w, 0); hooks.s8?.(acc, clk); }   // 0x1dd08(0,0) grain A + 0x1de34 sprite + BOM
  else if (s === 9) acc.set(await trail(9, k, 'nowhere', hooks.s9));
  else if (s === 10) acc.set(await trail(10, k, 'nowh2', (c, t) => hooks.s10?.(c, t, CLK_A8)));
  else if (s === 11) acc.set(await trail(11, k, 'creds', hooks.s11));
  else if (s === 12) acc.set(await trail(12, k, 'copyrigh', hooks.s12));
  else if (s === 7) { const n = (clk - 7 * START[7]) >> 8; copySlide(acc, await tex(S7SLIDE[n % 11])); hooks.s7?.(acc, clk, n & 1 ? 4 : 2); }   // 0x1ff01: (clk-clk0)>>8 mod 11 picks the slide, parity the mode
  return acc;
}
export async function frame(k) {                                // -> Uint8Array(640*480) display grey
  const out = new Uint8Array(WH);
  if (k > 0 && START.includes(k)) { if ([4, 6, 9, 10, 11, 12].includes(sceneOf(k))) await accOf(k); return out; }   // scene opening frame: black palette (S4/S6 still advance their buffer)
  const acc = await accOf(k), g = greyAt(k); for (let i = 0; i < WH; i++) out[i] = g[acc[i]];
  return out;
}

// player contract: scene = {start,end,render(ctx,t)}, t seconds from `start`; render is async here, so calls are queued (S4 keeps state) and only the latest is drawn
let q = Promise.resolve(), latest = 0;
export const scenes = [{name: '2d', start: 0, end: FRAMES / 10, render(ctx, t) {
  const my = ++latest, k = Math.min(FRAMES - 1, Math.round(t * 10));
  q = q.then(() => my === latest ? frame(k) : null).then((g) => {   // superseded requests are dropped before rendering (else a slow scene backs the queue up forever)
    if (!g || my !== latest) return;
    const im = ctx.createImageData(W, H);
    for (let i = 0; i < WH; i++) { const v = g[i]; im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255; }
    ctx.putImageData(im, 0, 0);
  });
} }];
