// scenes_3d_c.js - 3D layers of the scenes after S5: S6 = PALLO (scene fn 0x1fb74, frames 1364..1668) and S7 = EXE005 (0x1feb4, frames 1669..).
// Both draw into the screen buffer additively (mod 256) after the 2D part (scenes_2d.js builds the rest); hooks.s6 / hooks.s7 = (acc, clk).
import {palloModel, BANK, palloG, palloWire} from './scenes_3d.js';
import {render} from './engine.js';
const F = Math.fround, W = 640;

// S6 mode 4 call (0x1fd63, att 32, fx = fy = 0.8): same camera as the wire call (palloWire), bank seen by 0x422e8 = raw * BANK (the wire call sees raw * BANK^2).
// Stored as 639 x 479 rows (the resolve adds them to the 640-pitch buffer exactly like the S3..S5 layers).
export function palloSolid(clk) {
  const f = [0.0031, 0.0021, 0.0011].map((c) => F(clk * c));
  const target = [F(Math.sin(f[1]) * 50), F(Math.cos(f[0]) * 50), F(Math.sin(f[2]) * 50)];
  const eye = f.map((a) => F(Math.sin(a) * 200));
  const bank = F(F(Math.sin(F(f[2] * 4)) * 400) * BANK);
  return render(palloModel, {pulse: true, g: F(palloG(clk)), bw: 639, bh: 479, W, H: 480, mode: 4, att: 32, fx: F(0.8), fy: F(0.8), eye, target, bank, light: target});
}
export function pallo(acc, clk) {
  const L = palloSolid(clk), w = palloWire(clk);
  for (let y = 0; y < 479; y++) for (let x = 0; x < 639; x++) acc[y * W + x] = (acc[y * W + x] + L[y * 639 + x]) & 255;
  for (let i = 0; i < w.length; i++) acc[i] = (acc[i] + w[i]) & 255;
}

// ---- S7 = EXE005 (fn 0x1feb4): the screen buffer is overwritten with a credits slide, then ONE of: mode 4 (odd 256-tick period) / mode 2 (even), att 64, fx = fy = 0.8,
// track time = clk * 0.5 (absolute clock, wrapped into the 3DS range). Frames 1669..1705 are in the first (even) period: wire only.
import {mk} from './scenes_3d_b.js';
const S7 = await mk('EXE005', 64);
export const CLK0_S7 = 7 * 1669;
export function exe(acc, clk, mode) {
  const L = S7.layer(F(clk * 0.5), mode === 2 ? {mode: 2, pitch: 640, fx: F(0.8), fy: F(0.8)} : {fx: F(0.8), fy: F(0.8)});
  if (mode === 2) for (let i = 0; i < L.length; i++) acc[i] = (acc[i] + L[i]) & 255;
  else for (let y = 0; y < 479; y++) for (let x = 0; x < 639; x++) acc[y * W + x] = (acc[y * W + x] + L[y * 639 + x]) & 255;
}
