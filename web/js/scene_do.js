// scene_do.js - S2 ("do not bend", frames 424-548): the 4x4x4 wire lattice of DEMO.EXE scene fn 0x1f380 (second engine: 0x24a00 bend, 0x24488 splines+camera,
// 0x24334 draw). Port of the original float32 code, see re/NOTES.md "S2". drawDo(acc, clk) adds the object into the pre-palette 640x480 byte buffer (the sprites
// are NOT additive: dst+tex, or 0x40 when that exceeds 0x40).
import {lookAt} from './engine.js';
const F = Math.fround, W = 640, H = 480, CLK0 = 7 * 423;                       // scene fn entry clock (first loop iteration = frame 423)
const T = (v) => (v > -2147483649 && v < 2147483648 ? Math.trunc(v) : -2147483648);   // 0x2874a + fistp

// 32x32 blob 0x22b8c: (sin(x*pi/32) sin(y*pi/32))^4 * 32 (float32 stores)
const TEX = new Uint8Array(1024 + 64);
{ const a = F(3.1415926 / 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { let v = F(Math.sin(x * a) * Math.sin(y * a)); v = F(v * v); v = F(v * v); TEX[32 * y + x] = Math.trunc(v * 32); } }

// the 36 lines of the lattice (scene object init 0x22c44): 4 control points each, 3 axes x 12 (u,v) pairs, same order as the original
const UV = [[-24, -24], [-8, -24], [8, -24], [24, -24], [-24, 24], [-8, 24], [8, 24], [24, 24], [-24, -8], [24, -8], [-24, 8], [24, 8]];
const LINES = [];
for (const ax of [1, 0, 2]) for (const [u, v] of UV) {
  const pts = [];
  for (const s of [-24, -8, 8, 24]) pts.push(ax === 1 ? [u, s, v] : ax === 0 ? [s, u, v] : [u, v, s]);
  LINES.push(pts);
}

// camera (0x1f380 loop body) + matrix 0x24538 (= engine.js lookAt, columns 0/1 swapped and rows remapped (x,-z,y)); returns {a, cam, m}
export function setup(clk) {
  const t = F(F(clk) - F(CLK0));
  const a = F(Math.sin(t * 0.0061) * 0.04);
  const s1 = F(Math.sin(t * 0.0081312)), c2 = F(Math.cos(t * 0.006227)), s3 = F(Math.sin(t * 0.0073823));
  let len = F(Math.sqrt(s1 * s1 + c2 * c2 + s3 * s3)); if (len === 0) len = 1;
  const k = 48 / len, cam = [F(k * s1), F(k * c2), F(k * s3), F(Math.sin(t * F(0.003)) * 16), F(Math.cos(t * F(0.006)) * 16), F(Math.sin(t * F(-0.005)) * 16)];
  const e = lookAt(cam.slice(0, 3), cam.slice(3, 6), 0), m = new Float32Array(16), sw = [1, 0, 2, 3], er = [0, 2, 1, 3];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[4 * r + c] = r === 3 ? e[12 + sw[c]] : (r === 2 ? -1 : 1) * e[4 * er[r] + sw[c]];
  m[15] = 1;
  return {a, cam, m};
}

// 0x24a00 (bend about x: y,z rotate by x*a) + 0x23c30 (cubic Bezier at t=i/32, then camera transform) -> per line 32 records [x,y,z]
export function records(clk) {
  const {a, m} = setup(clk), out = [];
  for (const L of LINES) {
    const P = L.map(([x, y, z]) => {
      if (a !== 0) { const g = F(x * a), c = Math.cos(g), s = Math.sin(g); const ny = F(c * y - s * z), nz = F(s * y + c * z); y = ny; z = nz; }
      return [x, y, z];
    });
    const rec = [];
    for (let i = 0; i < 32; i++) {
      const t = i / 32, u = 1 - t, b0 = F(u * u * u), b1 = F(u * u * (t * 3)), b2 = F(t * t * 3 * u), b3 = F(t * t * t), v = [0, 0, 0];
      for (let c = 0; c < 3; c++) { const p = F(P[0][c] * b0 + P[1][c] * b1 + P[2][c] * b2 + P[3][c] * b3); v[c] = p; }
      const o = [0, 0, 0];
      for (let c = 0; c < 3; c++) { let q = F(v[0] * m[c]); q = F(v[1] * m[4 + c] + q); q = F(v[2] * m[8 + c] + q); o[c] = F(q + m[12 + c]); }
      rec.push(o);
    }
    out.push(rec);
  }
  return out;
}

const f32 = new Float32Array(1), i32 = new Int32Array(f32.buffer);
// 0x2400c: one 2r x 2r blob per record (nearest-neighbour scaled 32x32 texture), clipped to the screen (note: the last column x=639 / row y=479 is never drawn)
function blob(acc, x, y, z) {
  f32[0] = z; if (i32[0] <= 0x3f800000) return;
  const inv = F(1 / z), cx = T(x * 192 * inv * 0.7) + 319, cy = T(y * 192 * inv * 0.7) + 239, s = F(192 * 16 * inv * 0.25 * 0.25), r = T(s);
  if (-r > cx || r + 639 < cx || -r > cy || r + 479 < cy) return;
  const step = T(32 / (s * 2) * 65536);
  let skipX = 0, u0 = 0, skipY = 0, v0 = 0;
  if (cx < r) { skipX = r - cx; u0 = T(16 / s * skipX * 65536); }
  const endX = 639 - r < cx ? 639 + r - cx : 2 * r;
  if (r > cy) { skipY = r - cy; v0 = T(16 / s * skipY * 65536); }
  const endY = 479 - r < cy ? 479 + r - cy : 2 * r;
  let p = (cy - r + skipY) * W + cx - r + skipX, v = v0;
  for (let row = skipY; row < endY; row++, v = (v + step) | 0) {
    const ro = (v >> 16) << 5; let u = u0;
    for (let col = skipX; col < endX; col++, p++, u = (u + step) | 0) { const sum = acc[p] + TEX[(u >> 16) + ro]; acc[p] = sum <= 0x40 ? sum : 0x40; }
    p += W - (endX - skipX);
  }
}

// 0x24be4 (same code as engine.js line(), screen 640x480, add `col` per pixel)
function line(eb, x1, y1, x2, y2, col) {
  const W1 = W - 1, H1 = H - 1; let t;
  if (y2 < y1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
  if (0 > y2 || H1 < y1) return;
  if (x1 < 0 && x2 < 0) return;
  if (x1 > W1 && x2 > W1) return;
  if (y1 < 0) { if (y2 - y1 === 0) return; x1 = F((x2 - x1) / (y2 - y1) * (0 - y1) + x1); y1 = 0; }
  if (y2 > H1) { if (y2 - y1 === 0) return; x2 = F(T(H1 - y1) * (x2 - x1) / T(y2 - y1) + x1); y2 = H1; }
  if (x1 < 0) { if (x2 - x1 === 0) return; y1 = F((y2 - y1) / (x2 - x1) * (0 - x1) + y1); x1 = 0; }
  if (x2 < 0) { if (x2 - x1 === 0) return; y2 = F((y1 - y2) / (x1 - x2) * (0 - x2) + y2); x2 = 0; }
  if (x2 > W1) { y2 = F((y2 - y1) / (x2 - x1) * (W1 - x1) + y1); x2 = W1; }
  if (x1 > W1) { y1 = F((y2 - y1) / (x2 - x1) * (W1 - x1) + y1); x1 = W1; }
  if (y2 < y1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
  let dx = T(x2 - x1), dy = T(y2 - y1);
  if (Math.abs(dx) < Math.abs(dy)) {
    if (dy === 0) return;
    let o = T(y1) * W;
    const sl = T(dx * 65536 / dy);
    let x16 = T(Math.imul(T(1 - y1), sl) + x1 * 65536 + sl * y1) | 0;
    for (let i = 0; i < dy; i++, o += W, x16 = (x16 + sl) | 0) eb[(x16 >> 16) + o] += col;
  } else {
    if (x2 < x1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
    dx = T(x2 - x1); dy = T(y2 - y1);
    if (dx === 0) return;
    let o = T(x1);
    const sl = T(dy * 65536 / dx); let y16 = T(y1 * 65536);
    for (let i = 0; i < dx; i++, o++, y16 = (y16 + sl) | 0) eb[(y16 >> 16) * W + o] += col;
  }
}

export function drawDo(acc, clk) {
  const R = records(clk);
  for (const rec of R) for (const [x, y, z] of rec) blob(acc, x, y, z);                 // 0x24334 pass 1: blobs for every record of every line
  for (const rec of R) for (let j = 0; j < 31; j++) {                                    // pass 2: 31 segments per line, colour 0x20
    const A = rec[j], B = rec[j + 1], ia = F(192 / A[2]), ib = F(192 / B[2]);
    line(acc, F(ia * A[0] + 320), F(ia * A[1] + 240), F(ib * B[0] + 320), F(ib * B[1] + 240), 0x20);
  }
}
