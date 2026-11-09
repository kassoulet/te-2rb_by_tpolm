// scenes_3d_b.js - the 3D layers of S3 (IHAVITU, scene fn 0x1f604), S4 (LAS, 0x1f7c4) and S5 (TPOLM3, 0x1f990): mode 4 filled meshes, att = 128 / 32 / 64.
// Unlike TEEVEE/PALLO the camera is not procedural: it is the 3DS keyframer camera (0xB003 position/roll node + 0xB004 target node), sampled by 0x422e8
// from DENSE tables (one float32 sample per integer frame) built at load time (0x42e88 -> 0x58a7c / 0x58f74): Hermite spline with tension = continuity = bias = 0
// (the loader 0x4132c throws the TCB values away). Object nodes (0xB002) are not parsed by the demo: meshes are drawn exactly as stored (3DS (x,y,z) -> (-x,z,y)).
// The light is always the first light of the scene put ON THE CAMERA TARGET (scene+0xa4 == 0). Per frame the scene fn gives the track time (float32):
//   cur = start + arg (wrapped into [start,end) by repeated subtraction, float32),  arg = clk*0.3 (S3, absolute clock) | (clk-clk0)*0.11 (S4) | (clk-clk0)*0.32 (S5)
// where clk0 = clock when the scene fn was entered (= the clock of the first frame of the scene, see CLK0). Output: 639x479 layer added (mod 256) into the screen (pitch 640).
import {parse3ds, render} from './engine.js';
const F = Math.fround, W = 640, H = 480;
const isNode = typeof window === 'undefined';
const load = async (u) => isNode ? (await import('fs')).readFileSync(new URL(u, import.meta.url)) : await (await fetch(new URL(u, import.meta.url))).arrayBuffer();
const ab = (b) => b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

// ---------------------------------------------------------------- keyframer (0xB000): range + camera tracks
function parseKF(buf, cam) {                            // cam: name of the camera whose nodes are used (default: last 0xB003/0xB004 in the file)
  const dv = new DataView(buf), kf = {range: [0, 100], pos: null, tgt: null, roll: null};
  const track = (b, scalar) => {                       // 0xB020 / 0xB024 body: flags + 4 u16 + u32 count, keys: frame (low i16 used), flags, one f32 per set flag bit, value
    const n = dv.getUint32(b + 10, true), keys = []; let o = b + 14;
    for (let i = 0; i < n; i++) {
      const f = dv.getInt16(o, true), fl = dv.getUint16(o + 4, true); o += 6;
      for (let k = 0; k < 16; k++) if (fl >> k & 1) o += 4;
      if (scalar) { keys.push({f, v: [dv.getFloat32(o, true)]}); o += 4; }
      else { const x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true), z = dv.getFloat32(o + 8, true); keys.push({f, v: [-x, z, y]}); o += 12; }
    }
    return keys;
  };
  const nm = (o, end) => { while (o + 6 <= end) { const id = dv.getUint16(o, true), len = dv.getUint32(o + 2, true); if (len < 6) break; if (id === 0xb010) { let e = o + 6, n = ''; while (dv.getUint8(e)) n += String.fromCharCode(dv.getUint8(e++)); return n; } o += len; } return ''; };
  const walk = (o, end, node) => {
    while (o + 6 <= end) {
      const id = dv.getUint16(o, true), len = dv.getUint32(o + 2, true); if (len < 6) break;
      const b = o + 6, e = o + len;
      if (id === 0x4d4d || id === 0xb000) walk(b, e, 0);
      else if (id === 0xb003 || id === 0xb004) { if (!cam || nm(b, e) === cam) walk(b, e, id); }
      else if (id === 0xb008) kf.range = [dv.getUint32(b, true), dv.getUint32(b + 4, true)];
      else if (id === 0xb020 && node === 0xb003) kf.pos = track(b, false);
      else if (id === 0xb020 && node === 0xb004) kf.tgt = track(b, false);
      else if (id === 0xb024 && node === 0xb003) kf.roll = track(b, true);
      o = e;
    }
  };
  walk(0, buf.byteLength, 0);
  return kf;
}

// ---------------------------------------------------------------- dense tables (0x58a7c: vec3, 0x58f74: scalar). keys.length <= 1 -> no table (static)
const NIL = {f: 0, v: [0, 0, 0]};
function dense(keys, dim) {
  if (!keys || keys.length <= 1) return null;
  const nk = keys.length, first = keys[0].f, N = Math.trunc(keys[nk - 1].f - keys[0].f);
  let lo = first, hi = 0; for (const k of keys) { if (lo > k.f) lo = k.f; else if (hi < k.f) hi = k.f; }
  const tin = [], tout = [];
  for (let i = 0; i < nk; i++) {                       // tangents, tension = continuity = bias = 0 (every factor is exactly 1)
    const p = i ? keys[i - 1] : NIL, q = keys[(i + 1) % nk], k = keys[i];       // loop flag = 1: last.next = first, but first.prev is a NULL key (the original walks past the end of the list to find 'last'): frame 0, position 0
    const ri = F((k.f - p.f) / (q.f - p.f)), ro = F((q.f - k.f) / (q.f - p.f));
    tin.push(k.v.map((c, d) => F(((c - p.v[d]) + (q.v[d] - c)) * ri)));
    tout.push(k.v.map((c, d) => F(((c - p.v[d]) + (q.v[d] - c)) * ro)));
  }
  const out = new Float32Array(dim * (N + 1)); let idx = 0;
  for (let i = 0; i + 1 < nk; i++) {
    const k = keys[i], q = keys[i + 1], len = Math.trunc(q.f - k.f);
    for (let j = 0; j < len && idx < N + 1; j++, idx++) {
      const t = F(j / len), t2 = F(t * t), t3 = F(t2 * t);
      const h0 = F(t3 * 2 - t2 * 3 + 1), h1 = F(t3 * -2 + t2 * 3), h2 = F(t3 - t2 * 2 + t), h3 = F(t3 - t2);
      for (let d = 0; d < dim; d++) out[dim * idx + d] = F(((h1 * q.v[d] + h0 * k.v[d]) + h2 * tout[i][d]) + h3 * tin[i + 1][d]);
    }
  }
  return {N, first: lo, last: hi, d: out, dim, key0: keys[0].v};
}
const lerp = (a, b, c) => F(F(b - a) * c + a);

export class Scene {
  constructor(model, kf, att) {
    this.model = model; this.att = att; this.start = kf.range[0]; this.end = kf.range[1];
    this.pos = dense(kf.pos, 3); this.tgt = dense(kf.tgt, 3); this.roll = dense(kf.roll, 1);
    this.p0 = kf.pos ? kf.pos[0].v : model.cams[0].pos; this.t0 = kf.tgt ? kf.tgt[0].v : model.cams[0].target;
    this.bank = model.cams[0].bank;                    // cam+0x38: only used when there is no roll table (then scaled in place on every call)
  }
  cur(arg) {                                           // 0x2936c: current track frame (float32)
    const s = this.start, e = this.end; let v = F(s + F(arg)); if (!(v >= s)) v = s;
    while (!(e > v)) v = F(v - (e - s));
    return v;
  }
  sample(tb, cur, scalar) {                            // 0x422e8: lerp between the dense samples around t
    const N = tb.N; let t = tb.last > cur ? F(cur - tb.first) : N - 1;
    if (scalar && tb.first > t) t = tb.first;
    if (0 > t) t = 0;
    const t1 = N - 1 > t ? F(1 + t) : N - 1, it = Math.trunc(t), i1 = Math.trunc(t1), fr = F(t - it), d = tb.dim;
    return Array.from({length: d}, (_, c) => lerp(tb.d[d * it + c], tb.d[d * i1 + c], fr));
  }
  layer(arg, over = {}) {                              // over: render() parameter overrides (S7 uses mode 2, other fx/att)
    const cur = this.cur(arg), eye = this.pos ? this.sample(this.pos, cur) : this.p0, target = this.tgt ? this.sample(this.tgt, cur) : this.t0;
    let bank;
    if (this.roll) bank = F(this.sample(this.roll, cur, true)[0] * 0.0027777777777777775); else bank = this.bank = F(this.bank * 0.0017684404124003043);
    const o = {bw: 639, bh: 479, W, H, mode: 4, att: this.att, fx: F(0.4), fy: F(0.4), eye, target, bank, light: target, ...over};
    if (o.light === 'eye') o.light = eye;                // scene+0xa4 = 1: light on the camera eye (0x42a82; taken BEFORE the scaling below)
    if (o.a8) o.eye = eye.map((c) => F(c * (1 + o.a8)));  // scene+0xa8 (0x42aea): eye *= (1 + a8), a8 float32; the target is not scaled
    return render(this.model, o);
  }
}
export const mk = async (name, att, cam) => { const b = ab(await load(`../data/3ds/${name}.3DS`)); return new Scene(parse3ds(b), parseKF(b, cam), att); };
const S3 = await mk('IHAVITU', 128), S4 = await mk('LAS', 32), S5 = await mk('TPOLM3', 64);
// clock of the first frame of S4 / S5 (scene fn entry); S3 uses the absolute clock
export const CLK0 = {s4: 7 * 820, s5: 7 * 1080};

const add = (acc, L) => { for (let y = 0; y < 479; y++) for (let x = 0; x < 639; x++) acc[y * W + x] = (acc[y * W + x] + L[y * 639 + x]) & 255; };
export const s3 = (acc, clk) => add(acc, S3.layer(F(clk * 0.3)));
export const s4 = (acc, clk) => add(acc, S4.layer(F((clk - CLK0.s4) * 0.11)));
export const s5 = (acc, clk) => add(acc, S5.layer(F((clk - CLK0.s5) * 0.32)));
export const _scenes = {S3, S4, S5};
