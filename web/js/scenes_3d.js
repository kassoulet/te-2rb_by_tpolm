// scenes_3d.js - the TEEVEE scene (TV on a table). The 3D layer (engine.js) is bit-exact against the emulator; the rest of the frame
// (noise field, palette fade, the random digits under the TV) is APPROXIMATE (their generators 0x1dd08 / 0x1e078 / 0x1e63c are not ported).
import {parse3ds, render} from './engine.js';
const W = 640, H = 480, TICK = 70;
const T0 = 847;                                   // demo clock (70 Hz) at the start of the TV scene, fitted on emulator probes (eye angles = (clk-T0)*{.0077,.00446,.01036}, verified for 3 consecutive frames)
const isNode = typeof window === 'undefined';
const load = async (u) => isNode ? (await import('fs')).readFileSync(new URL(u, import.meta.url)) : await (await fetch(new URL(u, import.meta.url))).arrayBuffer();
const ab = (b) => b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const model = parse3ds(ab(await load('../data/3ds/TEEVEE.3DS')));
const F = Math.fround, TG = model.cams[0].target;

let alku = null;                                  // slide with the frame (grey 0..255 / 4 = 6 bit index)
if (!isNode) {
  const im = new Image(); im.src = new URL('../data/tex/alku.png', import.meta.url); await im.decode();
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data; alku = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) alku[i] = d[4 * i];
}

// camera = target + 100*sin(angle) (0x1f0f8), angle = (clk-T0)*rate; light sits on the target (scene+0xa4 == 0)
export function layer(clk) {
  const dt = clk - T0;
  const eye = [0.0385, 0.0223, 0.0518].map((r, i) => F(Math.sin(F(dt * r * 0.2)) * 100 + TG[i]));   // angle stored as float32, bit-exact vs emulator
  return render(model, {bw: 273, bh: 300, W, H, mode: 4, att: 0, fx: F(0.4), fy: F(0.4), eye, target: TG, light: TG});
}

let seed = 1; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
export function frame(clk) {                      // -> Uint8Array(W*H) display grey
  const out = new Uint8Array(W * H), L = layer(clk); seed = clk | 1;
  for (let y = 0; y < H; y++) {
    const dark = rnd() < 0.12;
    for (let x = 0; x < W; x++) {
      let v = dark || rnd() < 0.25 ? 0 : 4 * Math.floor(rnd() * 18);
      if (alku) v += alku[y * W + x] * 0.565;
      if (x >= 189 && x < 462 && y >= 55 && y < 355) v += 1.9 * (L[(y - 55) * 273 + x - 189] & 63);
      out[y * W + x] = Math.min(255, v);
    }
  }
  return out;
}

export const scenes = [{
  name: 'teevee', start: T0 / TICK, end: 42.6,
  render(ctx, t) {
    const g = frame(Math.round((t * TICK) / 7) * 7 + T0), im = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const v = g[i]; im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255; }
    ctx.putImageData(im, 0, 0);
  },
}];

// ---------------------------------------------------------------- PALLO (scene fn 0x1fb74, order 13 row 20 .. order 16 row 19): a pulsating sphere, mode 4 fill + mode 2 wire.
// Only the mode 2 (wireframe) layer is ported here: bit-exact vs emulator probes (17/17 frames, 0 differing bytes of the 640x479 delta). The mode 4 pass,
// the trail buffer (0x10f104 = (previous + 0x10f144 image) / 2 each frame) and palette/fade are NOT ported.
export const palloModel = parse3ds(ab(await load('../data/3ds/PALLO.3DS')));
export const BANK = 0.0017684404124003043;               // 0x422e8 scales cam+0x38 in place on EVERY call (units -> rad): the mode 4 call sees raw*BANK, the mode 2 call right after it raw*BANK*BANK (~0 roll)
// g = global 0x122644 (vertex pulse phase), += 0.18 per object per render call (2 renders per demo frame): it is PER FRAME, not per clock tick, unlike the camera (clk-driven).
// The original runs a free loop (no vsync/frame cap, 70 Hz MIDAS clock only), so the pulse speed depends on the machine's fps. The capture grid is 10 fps (7 ticks/frame);
// ORIG_FPS is the ASSUMED real fps (35 = 2 ticks/frame, the harness' original default K=2; real value unknown, machine dependent: raise it for a faster pulse). The phase is
// made a function of the clock: frames since the anchor = (clk - 9548)/70 s * ORIG_FPS. Anchor g(1364 @ clk 9548) = 2521.349365 before the mode 4 call (fitted on the 10 fps capture).
export const ORIG_FPS = 35;
export const palloG = (clk) => F(2521.349365234375 + 2 * 0.18 * ((clk - 9548) / 70) * ORIG_FPS);
export function palloWire(clk, g = F(palloG(clk) + F(0.18))) {                    // -> Uint8Array(640*480): delta added to the screen buffer by the mode 2 call (rows >= 479 untouched)
  const f = [0.0031, 0.0021, 0.0011].map((c) => F(clk * c));                // 0x1fbe3.. : float32 angles
  const target = [F(Math.sin(f[1]) * 50), F(Math.cos(f[0]) * 50), F(Math.sin(f[2]) * 50)];
  const eye = f.map((a) => F(Math.sin(a) * 200));
  const bank = F(F(F(Math.sin(F(f[2] * 4)) * 400) * BANK) * BANK);
  return render(palloModel, {pulse: true, g: F(g), bw: 639, bh: 479, pitch: 640, W, H, mode: 2, att: 32, fx: F(0.6), fy: F(0.6), eye, target, bank, light: target});
}
