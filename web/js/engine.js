// engine.js - port of te-2rb's float32 3D renderer (DEMO.EXE 0x2936c and callees). See re/notes_3d.md.
// Model: one additive Uint8 buffer (mod 256). Mode 4/8: filled triangles as edge deltas (+I at left edge, -I at right edge,
// 16.16 DDA), then a horizontal prefix sum (resolve 0x29784, the accumulator is NOT reset between rows). Mode 2: wire (see wire()).
// Flat shade per face from the angle normal/light, 5-plane recursive clipper (4 sides + near), camera = look-at (row-vector matrix).
// float32 storage points of the x87 code are Math.fround; intermediates stay double (the x87 keeps 64 bit mantissas: this is the only
// source of possible 1-ulp differences, never seen in the checked frames, see tools/cmp3d.mjs).
const F = Math.fround;

// ---------------------------------------------------------------- 3DS (only what the demo uses)
// vertices are loaded as (-x, z, y) (loader 0x40f38), camera chunk 0x4700 = pos, target, bank, lens (same remap), light 0x4600 = pos.
export function parse3ds(buf) {
  const dv = new DataView(buf), objects = [], cams = [], lights = [];
  let cur = null;
  const str = (o) => { let e = o; while (dv.getUint8(e)) e++; return [String.fromCharCode(...new Uint8Array(buf, o, e - o)), e + 1]; };
  const walk = (o, end) => {
    while (o + 6 <= end) {
      const id = dv.getUint16(o, true), len = dv.getUint32(o + 2, true); if (len < 6) break;
      const b = o + 6, e = o + len;
      if (id === 0x4d4d || id === 0x3d3d || id === 0x4100) walk(b, e);
      else if (id === 0x4000) { const [n, p] = str(b); cur = { name: n, v: null, f: null }; objects.push(cur); walk(p, e); }
      else if (id === 0x4110) { const n = dv.getUint16(b, true); cur.v = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) { const x = dv.getFloat32(b + 2 + 12 * i, true), y = dv.getFloat32(b + 6 + 12 * i, true), z = dv.getFloat32(b + 10 + 12 * i, true);
          cur.v[3 * i] = -x; cur.v[3 * i + 1] = z; cur.v[3 * i + 2] = y; } }
      else if (id === 0x4120) { const n = dv.getUint16(b, true); cur.f = new Uint16Array(3 * n);
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cur.f[3 * i + k] = dv.getUint16(b + 2 + 8 * i + 2 * k, true); }
      else if (id === 0x4700) { const g = (i) => dv.getFloat32(b + 4 * i, true); cur.cam = { pos: [-g(0), g(2), g(1)], target: [-g(3), g(5), g(4)], bank: g(6), lens: g(7) }; cams.push(cur.cam); }
      else if (id === 0x4600) { const g = (i) => dv.getFloat32(b + 4 * i, true); cur.light = { pos: [-g(0), g(2), g(1)] }; lights.push(cur.light); }
      o = e;
    }
  };
  walk(0, buf.byteLength);
  const meshes = objects.filter((o) => o.v && o.f).map(prepare);
  return { meshes, cams, lights };
}

// per-face centroid + unit normal (0x420f4), all float32 stores
function prepare(o) {
  const nf = o.f.length / 3, cen = new Float32Array(3 * nf), nor = new Float32Array(3 * nf), v = o.v;
  for (let i = 0; i < nf; i++) {
    const a = 3 * o.f[3 * i], b = 3 * o.f[3 * i + 1], c = 3 * o.f[3 * i + 2];
    const bx = v[b] - v[a], by = v[b + 1] - v[a + 1], bz = v[b + 2] - v[a + 2], cx = v[c] - v[a], cy = v[c + 1] - v[a + 1], cz = v[c + 2] - v[a + 2];
    let nx = F(by * cz - bz * cy), ny = F(bz * cx - bx * cz), nz = F(bx * cy - by * cx);
    const inv = F(1 / Math.sqrt(nx * nx + ny * ny + nz * nz));
    nor[3 * i] = F(nx * inv); nor[3 * i + 1] = F(ny * inv); nor[3 * i + 2] = F(nz * inv);
    for (let k = 0; k < 3; k++) cen[3 * i + k] = F((v[a + k] + v[b + k] + v[c + k]) * (1 / 3));
  }
  return { name: o.name, v, f: o.f, cen, nor, cv: new Float32Array(v.length) };
}

// ---------------------------------------------------------------- camera (0x422e8): look-at, row-vector matrix m[r*4+c]
// out = (x,y,z,1) * m ; columns = right, up, forward; row 3 = -(eye . axis). bank (roll) = rotation of right/up about forward
// (UNVERIFIED sign, bank is 0 in every camera of the demo that was checked).
export function lookAt(eye, tgt, bank = 0) {
  // 0x422e8 via the vec4 library: f has w=1 (!) and is normalised with the 4-norm (so |f| = 1/sqrt(1+1/len^2), ~0.99997 here);
  // r = f x up, u = f x r (both built from the UN-normalised f, w=0), then each vector normalised.
  const up = [F(Math.sin(bank)), F(Math.cos(bank)), 0];
  const f = [F(tgt[0] - eye[0]), F(tgt[1] - eye[1]), F(tgt[2] - eye[2])];
  const cross = (a, b) => [F(F(a[1] * b[2]) - F(a[2] * b[1])), -F(F(a[0] * b[2]) - F(a[2] * b[0])), F(F(a[0] * b[1]) - F(a[1] * b[0]))];
  let r = cross(f, up), u = cross(f, r);
  const nrm = (v, w) => { const l = F(Math.sqrt(v[1] * v[1] + v[0] * v[0] + v[2] * v[2] + w * w)); return v.map((c) => F(c / l)); };
  const fn = nrm(f, 1); r = nrm(r, 0); u = nrm(u, 0);
  const m = new Float32Array(16);
  for (let k = 0; k < 3; k++) { m[4 * k] = r[k]; m[4 * k + 1] = u[k]; m[4 * k + 2] = fn[k]; }
  for (let c = 0; c < 3; c++) { let t = F(-eye[0] * m[c]); t = F(t + -eye[1] * m[4 + c]); m[12 + c] = F(t + -eye[2] * m[8 + c]); }   // 0x2a590: product unrounded, running sum stored
  m[15] = 1;
  return m;
}

// ---------------------------------------------------------------- render
// p = {pulse (scene+0xa0), g (global 0x122644, updated in place), bw,bh (bitmap rect), W,H (screen size args), mode, att, fx,fy (the two float args, 0.4), eye,target,bank, light (pos or null)}
// returns Uint8Array(bw*bh): the layer that the original adds to the screen rect (mode 4/8: resolved; mode 2: edge buffer itself)
export function render(model, p) {
  // optional p.pitch/ox/oy: the original bitmap is a window (bw x bh at ox,oy) of a pitch-wide buffer; only wire() addresses it that way
  // (its clip leaves x = -1 / W pixels that land in the neighbouring row of the real buffer). Default = tight buffer (pitch = bw).
  const { bw, bh } = p, mode = p.mode, pitch = p.pitch || bw, ox = p.ox || 0, oy = p.oy || 0;
  const ctx = { bw, bh, pitch, ox, oy, eb: new Uint8Array(Math.max(bw * bh, pitch * (oy + bh))), mode };
  // mode 8: the outline lines (0x5d840 from 0x592d0) go straight into the 640-pitch screen bitmap, only the fill goes through the edge buffer + resolve
  if (mode === 8) ctx.wc = { bw, bh, pitch: p.wpitch || 640, ox: 0, oy: 0, eb: new Uint8Array((p.wpitch || 640) * (bh + 1)) };
  // focal (0x2936c): w*0.003125 * (arg*255) -> float32 ; both axes use +0x60 in the rasteriser
  ctx.foc = F(p.W * 0.003125 * (F(p.fx) * 255));
  const focY = F(p.H * (1 / 240) * (F(p.fy) * 255));
  // planes (0x29668): angle = atan(half/focal) - 0.0001 ; n.p - d >= 0 is inside
  const angX = F(Math.atan2(bw >> 1, ctx.foc) - 0.0001), angY = F(Math.atan2(bh >> 1, focY) - 0.0001);
  const sx = F(Math.sin(angX)), cx = F(Math.cos(angX)), sy = F(Math.sin(angY)), cy = F(Math.cos(angY));
  ctx.pl = [[cx, 0, sx, 0], [F(-cx), 0, sx, 0], [0, cy, sy, 0], [0, F(-cy), sy, 0], [0, 0, 1, -10]];
  if (ctx.wc) ctx.wc.foc = ctx.foc;
  const m = lookAt(p.eye, p.target, p.bank || 0); ctx.m = m;
  for (const o of model.meshes) {
    const v = o.v, cv = o.cv;
    for (let i = 0; i < v.length; i += 3) {                                                          // 0x41bdc
      let x = v[i], y = v[i + 1], z = v[i + 2];
      if (p.pulse) { const s = F(Math.sin(y * 0.05 + p.g * 0.5) * 0.3 + 0.8); x = F(x * s); y = F(y * s); z = F(z * s); }   // scene+0xa0 pulse (0x41c2e), g = global 0x122644
      for (let k = 0; k < 3; k++) { let t = F(x * m[k]); t = F(y * m[4 + k] + t); t = F(z * m[8 + k] + t); cv[i + k] = F(m[12 + k] + t); }
    }
    p.g = F((p.g || 0) + F(0.18));                                                                    // 0x41e16: += 0.18 after every object's vertex pass (updates p.g in place)
  }
  for (const o of model.meshes) {
    const nf = o.f.length / 3, cv = o.cv;
    for (let i = 0; i < nf; i++) {
      const s = shade(o, i, p);
      const a = 3 * o.f[3 * i], b = 3 * o.f[3 * i + 1], c = 3 * o.f[3 * i + 2];
      clip(ctx, [cv[a], cv[a + 1], cv[a + 2], s], [cv[b], cv[b + 1], cv[b + 2], s], [cv[c], cv[c + 1], cv[c + 2], s], 0);
    }
  }
  if (mode === 4 || mode === 8) {                                                                    // resolve 0x29784
    const n = bw * bh, out = new Uint8Array(n); let acc = 0;
    for (let i = 0; i < n; i++) { acc += ctx.eb[i]; out[i] = acc & 255; }
    if (ctx.wc) out.wire = ctx.wc.eb;                                                                // mode 8: second layer (640-pitch) to add as well
    return out;
  }
  return ctx.eb;
}

// 0x41e30 + acos 0x59284 (pi/2 - atan(c/sqrt(1-c^2))); light = null -> light at the origin. NB the 16/pi constant at 0x10326d is 0.3183099524062959 (not 1/pi): 1625 shade of one face sat on an integer boundary
function shade(o, i, p) {
  const cx = o.cen[3 * i], cy = o.cen[3 * i + 1], cz = o.cen[3 * i + 2], nx = o.nor[3 * i], ny = o.nor[3 * i + 1], nz = o.nor[3 * i + 2];
  const L = p.light || [0, 0, 0];
  const dx = F(L[0] - cx), dy = F(L[1] - cy), dz = F(L[2] - cz);
  const dist = F(Math.sqrt(dx * dx + dy * dy + dz * dz)), dot = F(dx * nx + dy * ny + dz * nz);
  const c = dot / dist, th = acos(c);
  if (!p.light) return Math.trunc(256 - th * 81.48734781601176);
  let att = 1; if (p.att) att = dist < 75 ? F(p.att) * 0.13333333333333333 : F(p.att) / (dist * 0.1);
  return Math.trunc((16 - th * (16 * 0.3183099524062959)) * F(att));
}
const acos = (c) => (1 - c * c === 0 ? (c > 0 ? 0 : Math.PI) : Math.acos(c));

// ---------------------------------------------------------------- clipper (0x592d0): vertex = [x,y,z,w(shade)]
function clip(ctx, v1, v2, v3, idx) {
  if (ctx.mode === 8) wire(ctx.wc, v1, v2, v3);
  const V = [v1, v2, v3], oc = [0, 0, 0, 0, 0], d = [[], [], []];
  for (let k = idx; k < 5; k++) {
    const n = ctx.pl[k];
    for (let j = 0; j < 3; j++) { const v = V[j]; d[j][k] = F(v[1] * n[1] + v[0] * n[0] + v[2] * n[2] - n[3]); if (0 > d[j][k]) oc[k] += 1 << j; }
  }
  for (let k = 0; k < 5; k++) {
    const c = oc[k]; if (!c) continue;
    if (c === 7) return;
    const one = c === 1 || c === 2 || c === 4;
    // A = the odd vertex (outside for 1/2/4, inside for 3/5/6); B,C the other two in cyclic order
    const ia = one ? (c === 1 ? 0 : c === 2 ? 1 : 2) : (c === 6 ? 0 : c === 5 ? 1 : 2), ib = (ia + 1) % 3, ic = (ia + 2) % 3;
    const A = V[ia], B = V[ib], C = V[ic], dA = d[ia][k];
    const tB = F(-dA / (d[ib][k] - dA)), tC = F(-dA / (d[ic][k] - dA));
    const lerp = (Q, t) => [F((Q[0] - A[0]) * t + A[0]), F((Q[1] - A[1]) * t + A[1]), F((Q[2] - A[2]) * t + A[2]), F((Q[3] - A[3]) * t + A[3])];
    const N1 = lerp(B, tB), N2 = lerp(C, tC);
    if (one) { clip(ctx, N1, B, C, k + 1); clip(ctx, N1, C, N2, k + 1); }
    else clip(ctx, A, N1, N2, k + 1);
    return;
  }
  if (ctx.mode === 4 || ctx.mode === 8) fill(ctx, v1, v2, v3); else if (ctx.mode === 2) wire(ctx, v1, v2, v3);
}

// ---------------------------------------------------------------- filled triangle as edge deltas (0x5e010)
function fill(ctx, a, b, c) {
  const { bw, bh, foc, eb } = ctx, hw = bw * 0.5, hh = bh * 0.5;
  const I = Math.trunc((a[3] + b[3] + c[3]) * F(1 / 3)) & 255;
  const pj = (v) => { const inv = F(1 / v[2]); return [F(v[0] * inv * foc + hw), F(v[1] * inv * foc + hh)]; };
  let [x1, y1] = pj(a), [x2, y2] = pj(b), [x3, y3] = pj(c), t;
  if (y1 > y2) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
  if (y2 > y3) { t = x2; x2 = x3; x3 = t; t = y2; y2 = y3; y3 = t; if (y1 > y2) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; } }
  const Y1 = Math.trunc(y1), Y2 = Math.trunc(y2), Y3 = Math.trunc(y3), d12 = Y2 - Y1, d13 = Y3 - Y1, d23 = Y3 - Y2;
  const s12 = d12 ? F((x2 - x1) / d12) : 0, s13 = d13 ? F((x3 - x1) / d13) : 0, s23 = d23 ? F((x3 - x2) / d23) : 0;
  const A12 = F((1 - y1) * s12 + x1 + Y1 * s12), A13 = F((1 - y1) * s13 + x1 + Y1 * s13), A23 = F((1 - y2) * s23 + x2 + Y2 * s23);
  const i12 = Math.trunc(s12 * 65536), i23 = Math.trunc(s23 * 65536), i13 = Math.trunc(s13 * 65536);
  const T = (v) => Math.trunc(v * 65536) | 0;
  let L, R, iL1, iL2;
  if (d12 * s13 + x1 > x2) { L = T(A12); R = T(A13); iL1 = i12; iL2 = i23; }                         // long edge on the right
  else { L = T(A13); R = T(A12); iL1 = i13; iL2 = i13; }                                             // long edge on the left
  const caseA = d12 * s13 + x1 > x2;
  const n = bw * bh;
  let row = Y1 * bw;
  const put = (l, r) => { const p = row + (l >> 16), q = row + (r >> 16); if (p >= 0 && p < n) eb[p] += I; if (q >= 0 && q < n) eb[q] -= I; };
  if (caseA) {
    if (d12) for (let y = Y1; y < Y2; y++) { put(L, R); row += bw; L = (L + i12) | 0; R = (R + i13) | 0; }
    L = T(A23);
    if (d23) for (let y = Y2; y < Y3; y++) { put(L, R); row += bw; L = (L + i23) | 0; R = (R + i13) | 0; }
  } else {
    if (d12) for (let y = Y1; y < Y2; y++) { put(L, R); row += bw; L = (L + i13) | 0; R = (R + i12) | 0; }
    R = T(A23);
    if (d23) for (let y = Y2; y < Y3; y++) { put(L, R); row += bw; L = (L + i13) | 0; R = (R + i23) | 0; }
  }
}

// ---------------------------------------------------------------- wireframe (mode 2, and mode 8 outline): 0x5d840 (project + 3 lines), 0x5da58 (line)
const T = (v) => (v > -2147483649 && v < 2147483648 ? Math.trunc(v) : -2147483648);          // 0x2874a + fistp (NaN/overflow -> 0x80000000)
function wire(ctx, a, b, c) {
  if (0 > a[2] || 0 > b[2] || 0 > c[2]) return;
  const { bw, bh, foc } = ctx, hw = bw * 0.5, hh = bh * 0.5;
  const pj = (v) => { const inv = F(1 / v[2]); return [F(v[0] * inv * foc + hw), F(v[1] * inv * foc + hh)]; };
  const p = [pj(a), pj(b), pj(c)], col = [T(a[3]) & 255, T(b[3]) & 255, T(c[3]) & 255];
  line(ctx, p[0][0], p[0][1], p[1][0], p[1][1], col[0]);
  line(ctx, p[1][0], p[1][1], p[2][0], p[2][1], col[1]);
  line(ctx, p[2][0], p[2][1], p[0][0], p[0][1], col[2]);
}

// 0x5da58: float clip to [0,W-1]x[0,H-1] (every intermediate stored as float32), 16.16 DDA, one byte add per pixel (no bounds check that matters:
// the original only calls an error print at offset >= 0x4b000 and goes on)
function line(ctx, x1, y1, x2, y2, col) {
  const { bw, bh, pitch, ox, oy, eb } = ctx, W1 = bw - 1, H1 = bh - 1; let t;
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
  if (Math.abs(dx) < Math.abs(dy)) {                                                                   // y-major
    if (dy === 0) return;
    let o = T(oy + y1) * pitch + ox;
    const sl = T(dx * 65536 / dy);
    let x16 = T(Math.imul(T(1 - y1), sl) + x1 * 65536 + sl * y1) | 0;                                  // pre-stepped to the next scanline (in the bits)
    for (let i = 0; i < dy; i++, o += pitch, x16 = (x16 + sl) | 0) eb[(x16 >> 16) + o] += col;
  } else {                                                                                             // x-major
    if (x2 < x1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
    dx = T(x2 - x1); dy = T(y2 - y1);
    if (dx === 0) return;
    let o = T(x1) + ox + oy * pitch;
    const sl = T(dy * 65536 / dx); let y16 = T(y1 * 65536);
    for (let i = 0; i < dx; i++, o++, y16 = (y16 + sl) | 0) eb[(y16 >> 16) * pitch + o] += col;
  }
}
