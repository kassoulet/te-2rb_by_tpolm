// scenes_3d_f.js - 3D layers of S11 (scene fn 0x20730, from order 26 row 5) and S12 (0x208f4, from order 27 row 4): TPOLM1.3DS ([0x10f2b4], its only camera Camera01),
// mode 2 (wire, 639x479 window of the 640-pitch screen, like S7), att 128 (0x43000000), fx = fy = 0.4, scene+0xa4 = 1 (light on the camera eye),
// track time = clk * 0.15 (0x1016d1 / 0x1016e9, absolute clock). Added (mod 256) into the trail buffer (scenes_2d.js trail(): slide creds / copyrigh).
import {mk} from './scenes_3d_b.js';
const F = Math.fround;
const sc = await mk('TPOLM1', 128);
const draw = (acc, clk) => { const L = sc.layer(F(clk * 0.15), {light: 'eye', mode: 2, pitch: 640}); for (let i = 0; i < L.length; i++) acc[i] = (acc[i] + L[i]) & 255; };
export const s11 = draw, s12 = draw;   // the two scenes differ only in slide and palette
