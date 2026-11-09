// noise.js - the grain of te-2rb: two 4*640*480 byte "noise" buffers built once at start-up from the Watcom rand() LCG (seed 1),
// and the per-frame grain copy of 0x1dd08. Bit-exact against the emulator memory (buffers at [0x10f288]/[0x10f28c], checked byte by byte).
//   rand()  0x28716: seed = seed*0x41c64e6d + 12345 (mod 2^32); return (seed>>16)&0x7fff.  Seed lives at 0x105f4c, starts at 1 (nobody calls srand).
//   gen A   0x22948: N=1228800 bytes of (rand&255)>>6, then 100 runs  [ (sin(rand)+1)*N-ish ...) filled with (rand&255)>>4
//   gen B   0x22a44: N bytes of trunc(((rand&255)>>3)^2/32), then 300 runs of zeros
//   grain   0x1dd08(eax=0, edx=1): off = trunc((sin(rand)+1) * 307200*2); acc[0..307200) = noiseB[off..] (wrapping at N=4*307200)
// The demo calls rand() once per frame for the whole noise part (frames 0..548 of the golden run) and never in the later scenes.
export const W = 640, H = 480, WH = W * H, N = 4 * WH;
const M = 0x41c64e6d;
const step = (s) => (Math.imul(s, M) + 12345) >>> 0;
export const SEED_PRE0 = 0x6e229d77;          // rand state right before frame 0's grain call (base state after both generators, +4546 calls of the other start-up code)
export const LAST_NOISE_FRAME = 548;          // frame 548 is the last one that calls rand() (emulator seeds: constant from there on)

// jump-ahead of the LCG by n steps (BigInt, called once per frame)
const MOD = 1n << 32n;
export function jump(s, n) {
  let a = BigInt(M), c = 12345n, ra = 1n, rc = 0n, k = BigInt(n);
  while (k > 0n) { if (k & 1n) { ra = ra * a % MOD; rc = (rc * a + c) % MOD; } c = (a + 1n) * c % MOD; a = a * a % MOD; k >>= 1n; }
  return Number((ra * BigInt(s) + rc) % MOD);
}
const rnd = (S) => { S.s = step(S.s); return (S.s >>> 16) & 0x7fff; };

let bufA = null, bufB = null;
export function buffers() {
  if (bufB) return { A: bufA, B: bufB };
  const S = { s: 1 };
  bufA = new Uint8Array(N); bufB = new Uint8Array(N);
  for (let i = 0; i < N; i++) bufA[i] = (rnd(S) & 255) >> 6;
  for (let r = 0; r < 100; r++) {
    const esi = Math.trunc((Math.sin(rnd(S)) + 1) * 1000), c = rnd(S) & 255;
    const ebx = Math.trunc((Math.sin(rnd(S)) + 1) * (N - esi)) >>> 2;
    bufA.fill(c >> 4, ebx, ebx + esi);
  }
  const f = Math.fround;
  for (let i = 0; i < N; i++) { const v = f((rnd(S) & 255) >> 3) * 0.03125, q = f(v), sq = f(q * q); bufB[i] = Math.trunc(sq * 32) & 255; }
  for (let r = 0; r < 300; r++) {
    const esi = Math.trunc((Math.sin(rnd(S)) + 1) * 600); rnd(S);
    const ebx = Math.trunc((Math.sin(rnd(S)) + 1) * (N - esi)) >>> 1;
    bufB.fill(0, ebx, ebx + esi);
  }
  return { A: bufA, B: bufB };
}

// rand() state used by frame k's grain call
export const seedFor = (k) => jump(SEED_PRE0, k + 1);
// acc <- grain for rand value r (0x1dd08 with edx=1: buffer B)
export function grain(acc, r, useA = false) {            // useA: 0x1dd08 with edx=0 (S8) reads buffer A
  const B = useA ? buffers().A : buffers().B;
  const off = Math.trunc((Math.sin(r) + 1) * 4 * WH * 0.5);
  if (3 * WH > off) acc.set(B.subarray(off, off + WH));          // jle 0x1dd80 taken when 3*WH <= off
  else { const a = N - off; acc.set(B.subarray(off, N), 0); acc.set(B.subarray(0, WH - a), a); }
  return acc;
}
export const grainForFrame = (acc, k) => grain(acc, ((jump(SEED_PRE0, k + 1) >>> 16) & 0x7fff));
// S8 (0x200d8) calls the same rand() once per iteration, continuing after frame 548's call (S3..S7 never call it): frame k >= START[8] uses call number 549 + k - START[8]
export const grainA = (acc, k, start) => grain(acc, ((jump(SEED_PRE0, 549 + k - start + 1) >>> 16) & 0x7fff), true);
