// scenes_3d_d.js - 3D layer of S8 (scene fn 0x200d8, order 20 row 0 .. order 22 row 4): BOM.3DS, camera "Camera02" (0x292ac), mode 4, att 64, fx = fy = 0.4,
// track time = clk * 0.15 (absolute clock, 0x101659). Added (mod 256) into the buffer after the grain (noise A) and the 6998 sprite, like S3..S5.
import {mk} from './scenes_3d_b.js';
const F = Math.fround, W = 640;
const S8 = await mk('BOM', 64, 'Camera02');
export function bom(acc, clk) {
  const L = S8.layer(F(clk * 0.15));
  for (let y = 0; y < 479; y++) for (let x = 0; x < 639; x++) acc[y * W + x] = (acc[y * W + x] + L[y * 639 + x]) & 255;
}
