// scenes_3d_e.js - 3D layers of S9 (scene fn 0x202d8, order 22 row 4 .. 24 row 6) and S10 (0x204e0, from order 24 row 6): BOM.3DS again, camera "Camera02",
// fx = fy = 0.4, att 32, track time = clk * 0.15, scene+0xa4 = 1 = the light sits on the CAMERA EYE (0x42a82; S8 had it on the target).
// S9 = mode 4 (0x20393), S10 = mode 8 (0x205ac: outline + fill, engine.js clip()). Layers are added in place (mod 256) into the trail buffer (scenes_2d.js trail()).

import {mk} from './scenes_3d_b.js';
const F = Math.fround, W = 640;
const sc = await mk('BOM', 32, 'Camera02');
const add = (acc, L) => { for (let y = 0; y < 479; y++) for (let x = 0; x < 639; x++) acc[y * W + x] = (acc[y * W + x] + L[y * 639 + x]) & 255; };
export const s9 = (acc, clk) => add(acc, sc.layer(F(clk * 0.15), {light: 'eye'}));
// 0x20686: a8 = (clk - clk_first) * 0.002 (float32) once order*64+row > 1604 (float 0x44c88000) (scenes_2d CLK_A8)
export const s10 = (acc, clk, clkA8) => {
  const L = sc.layer(F(clk * 0.15), {light: 'eye', mode: 8, a8: clkA8 !== undefined && clk > clkA8 ? F((clk - clkA8) * 0.002) : 0});
  add(acc, L); for (let i = 0; i < L.wire.length; i++) acc[i] = (acc[i] + L.wire[i]) & 255;   // fill (resolved) + outline (direct)
};
