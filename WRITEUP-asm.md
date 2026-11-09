# te-2rb (TPOLM, The Gathering 1998) - asm snippets worth reading

All addresses are linear addresses of the unpacked image (`DEMO.EXE` = PMODE/W stub + Watcom C/C++ 32-bit flat model; image dumped by `re/unpack_pmodew.py`,
code object = `re/code.bin`, which starts at linear 0x1b000, so `file offset = addr - 0x1b000`). Watcom register convention: arguments in EAX, EDX, EBX, ECX, then the
stack; result in EAX (or ST0 for floats). Every function starts with `push N / call 0x251f0` (Watcom stack-overflow check) - omitted below.

**Method and caveats.** Listings are quoted from `re/code.dis` (a linear disassembly) *and re-checked against the raw bytes of `re/code.bin` with `ndisasm -b32`*,
because `code.dis` is desynchronised at a few function starts:

* 0x592d0 (the clipper): `code.dis` shows garbage at 0x592cf..0x592d7. The real entry is `push 0x428 / call 0x251f0` at 0x592d0. All clipper listings below come from the bytes.
* 0x5d800 / 0x5d840: the real entries are `push ebp` at 0x5d800 (sqrt wrapper) and `push 0x60` at 0x5d840 (mode-2 triangle).
* 0x59284 (acos) reads identically in both and is quoted as is.
* 0x29784, 0x5da58, 0x5e010, 0x41e30, 0x2874a, 0x1d010, 0x1e044: identical in `code.dis` and in the bytes (checked).

Everything here is **static analysis**: nothing was single-stepped for this write-up except where a note says so. What is a guess is marked *(guess)*.
Constants were read from `re/data.bin` (base 0x100000): 0x103b50 = 65536.0 (double), 0x103b58 = 0.5 (double), 0x103b60 = 0.33333334 (float), 0x103b68 = 65536.0 (double),
0x10324d = 81.4873478 (double, 256/pi), 0x103255 = 256.0, 0x10325d = 0.1, 0x103265 = 0.13333, 0x10326d = 0.3183099524062959 (very close to 1/pi = 0.3183098862 but not equal), 0x10beb0 = pi/2 (long double).

The renderer is **not** a 1998 textured/z-buffered engine. It is a deliberately tiny additive monochrome one: one 640x480 *byte* buffer, no z-buffer, no sort, no
texture. All the cleverness is in how little the inner loops do. (The demo is black and white on purpose: INFOFILE says it "is _supposed_ to be black & white 640x480".)

---

## 1. Fill without a fill loop: edge deltas + one prefix-sum pass (0x5e010, 0x29784)

Triangle rasteriser, innermost loop of the "left edge is the short one" case (0x5e38d..0x5e3d5; the mirrored case is at 0x5e491..0x5e4d9, and the second half of the
triangle at 0x5e409 / 0x5e4ff):

```
5e38d  mov eax,[ebx+0xc]            ; scene
5e390  mov esi,[esp+0x6c]           ; xl  (16.16)
5e394  sar esi,0x10                 ; integer column
5e397  lea edi,[edx+esi]            ; edx = row*width  -> edge-buffer offset
5e39a  mov esi,[eax+0x68]           ; scene+0x68 = the 0x4b000-byte edge buffer
5e39d  add esi,edi
5e39f  mov al,[esp+0x78]            ; I = triangle intensity (byte)
5e3a3  add [esi],al                 ; edge buffer[row][xl] += I
5e3a5  ...  mov esi,[esp+0x70] / sar esi,0x10 / add esi,edx / add esi,[eax+0x68]
5e3ba  sub [esi],al                 ; edge buffer[row][xr] -= I
5e3bc  mov eax,[ebx+0xc] / mov eax,[eax+0x5c] / add edx,[eax+0xc]   ; next row: edx += bitmap width
5e3c5  mov eax,[esp+0x5c] / add [esp+0x6c],eax      ; xl += slope_left   (16.16)
5e3cd  mov eax,[esp+0x68] / add [esp+0x70],eax      ; xr += slope_right  (16.16)
5e3d5  inc ecx
5e3d6  cmp ecx,[esp+0x64] / jl 0x5e38d
```

That is the whole "fill": **two byte writes per scanline** (`add [m],al` and `sub [m],al`). The span interior is *not* touched. The interiors are rebuilt once per
frame for all triangles at the same time by the resolve pass (0x29784, loop 0x297ba..0x297d5):

```
297ba  lea esi,[ecx+ebp]            ; ebp = edge buffer (arg), ecx = running pixel index
297bd  movzx esi,byte [esi]         ; d = edge[i]            (signed deltas stored as bytes, i.e. mod 256)
297c0  add [esp+4],esi              ; acc += d               (dword on the stack, never reset between rows)
297c4  mov esi,[edi]                ; bitmap data pointer
297c6  mov bl,[esp+4]               ; low byte of acc
297ca  add [esi+eax],bl             ; screen[o] += (uint8)acc
297cd  inc edx / inc eax / inc ecx   ; x, destination offset, source index
297d0  mov esi,[edi+0xc]            ; width (reloaded every pixel)
297d3  cmp edx,esi / jl 0x297ba
297d7  inc [esp]  ...  mov edx,[edi+4] / sub edx,esi / add eax,edx   ; end of row: dst += pitch - width
```

Equivalent C (the unsigned byte wrap is the point):

```c
/* per scanline, from the triangle setup (xl < xr, 16.16) */
edge[y*W + (xl >> 16)] += I;          /* uint8_t, wraps */
edge[y*W + (xr >> 16)] -= I;
/* once per frame */
uint32_t acc = 0;
for (i = 0, y = 0; y < H; y++, o += pitch - W)
  for (x = 0; x < W; x++, i++, o++) { acc += edge[i]; screen[o] += (uint8_t)acc; }
```

```js
// JS, same thing
let acc = 0, i = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { acc = (acc + edge[i]) | 0; dst[o + y*pitch + x] = (dst[o + y*pitch + x] + acc) & 255; }
```

Why it is clever:

* **Cost per triangle is O(height), not O(area).** The O(area) work (12 instructions per pixel, ~3.7 M instructions for 640x480, *my estimate*) is paid once per frame
  and shared by every triangle in the scene, however many there are and however big.
* **The sum is linear, so overlaps are free.** Deltas of different triangles simply add in the same buffer; the final prefix sum equals the sum of the individual
  fills. Because byte addition mod 256 is commutative and associative, there is **no ordering, no z-buffer and no sorting** - that is what gives the demo its additive,
  X-ray look. (That is why the "radix sort" of the sibling demo `inside` has no counterpart here.)
* **The accumulator is never reset.** `[esp+4]` is zeroed once (0x297a0). Each triangle writes `+I` and `-I`, so the total returns to 0 at the end of every span and the
  running sum is 0 at every row start. Half-open spans `[xl, xr)`. A right edge that lands exactly on column W spills its `-I` into column 0 of the *next* row, where the
  accumulator still holds `+I` - which cancels it exactly (my reading of the code, not proved by a test). Clipped triangles therefore never need per-row bookkeeping.
* **The destination add is a byte add too**: `add [esi+eax],bl` merges the filled layer into the screen buffer (which may already hold the wireframe layer drawn by the
  line drawer of section 2) with no read of the target into a register.
* The intensity `I` is just `trunc((w1+w2+w3) * (1/3))` (0x5e107..0x5e123: `fadd/fadd/fmul [0x103b60]` then `call 0x2874a; fistp; mov al,[esp+0x74]`): the face shade
  rides in the vertex `w` through projection and clipping and is averaged per face = flat shading for free.

How the setup feeds it (0x5e010..0x5e2f6):

* projection of each vertex: `sx = x * (1/w) * focal + width*0.5` (0x5e046..0x5e065, `fmul [edx+0x60]`, `fild [bitmap+0xc]`, `fmul [0x103b58]`), one `fdiv` per vertex (`fld1/fdivrp`);
* three compare-and-swap blocks sort the vertices by y (0x5e127, 0x5e164, 0x5e1a1) - written as dword moves through a temp, no branch-free trick;
* three float slopes `dx/dy` (guarded by `test ecx,ecx / je` against empty halves), converted once to 16.16 by `fmul [0x103b68]` (65536.0) + `call 0x2874a; fistp`
  (0x5e2fa..0x5e32f): **the per-scanline step is a single integer `add`**;
* the starting x is pre-stepped to the first scanline: `x1 + slope*(1 - y1 + trunc(y1))` (0x5e287..0x5e2f6). Note this evaluates the edge at `trunc(y1)+1`-ish while writing row
  `trunc(y1)`: a half-pixel-class bias that a port must reproduce (it is in the bits);
* which edge is left is decided **once per triangle**, not per scanline: `trunc(ecx)*slope_long + x1` is compared with the middle vertex x (0x5e341..0x5e358, `jbe 0x5e462`).
  The two orientations are two physically duplicated loop bodies (0x5e38d and 0x5e491) - code size spent to keep the loop free of any test.

Notes on what is *not* clever: edge pointers, the buffer base `[scene+0x68]` and the bitmap width are reloaded from memory through `[ebx+0xc]` on every scanline
(Watcom kept very little in registers; the FPU slopes live in stack slots). The loops are small enough not to care.

## 2. Additive line drawer: 16.16 DDA, float clip, byte add (0x5da58)

Wireframe mode (mode 2) draws lines that *add* intensity (wrap at 256). The routine takes the two endpoints and a colour byte (`[ebp+0x2c]`). It (a) clips in float, (b) picks the
major axis, (c) converts the slope **once** to 16.16, (d) runs a one-add-per-pixel loop. The y-major loop (0x5de8f..0x5dec7):

```
5de8f  mov eax,[esp+0x3c]           ; slope  (dx/dy, 16.16)
5de93  add [esp+0x44],eax           ; x16 += slope
5de97  mov eax,[esi+0xc] / mov eax,[eax+0x5c]
5de9d  inc ebx                      ; i++
5de9e  add ecx,[eax+4]              ; row offset += pitch
5dea1  cmp ebx,[esp+8] / jge exit   ; i < dy
5deab  mov eax,[esi+0xc] / mov edi,[eax+0x5c]
5deb1  mov eax,[esp+0x44]
5deb5  sar eax,0x10                 ; x = x16 >> 16
5deb8  add eax,ecx                  ; + row offset
5deba  mov edi,[edi]                ; bitmap data
5debc  mov dl,[ebp+0x2c]            ; colour
5debf  add [edi+eax],dl             ; pixel += colour   (byte wrap)
5dec2  cmp eax,0x4b000 / jl 0x5de8f ; the only bounds check
```

The x-major loop (0x5dfa6..0x5dfe6) is the same with the roles swapped: `y16 += slope; y = y16>>16; offset = y*pitch + x`.

Setup, in order (0x5da9f..0x5ddea):

1. sort endpoints by y (swap through temp), then clip against y = 0 and y = H-1 with `x' = x1 + (y' - y1) * (x2-x1)/(y2-y1)` (e.g. 0x5db8a..0x5db9c);
2. clip against x = 0 and x = W-1 the same way (0x5dc62.., 0x5dcbd.., 0x5dd05.., 0x5dd4c..); every clip that has a zero divisor `fldz/fcompp/je` aborts the line;
3. `dx = trunc(x2-x1)`, `dy = trunc(y2-y1)`, `|dx| >= |dy|` selects x-major (`call 0x2b405` = abs, `cmp edx,eax / jge 0x5deda`); x-major also re-sorts by x;
4. `slope = trunc(d_minor * 65536.0 / d_major)` (`fmul [0x103b50]` = 65536.0 double, `fdivp`, `call 0x2874a`, `fistp`; 0x5de27..0x5de40, 0x5df73..0x5df8c).

```c
void line(buf, W, H, x1,y1,x2,y2, c) {      /* floats */
  clip_to(0,W-1,0,H-1);                     /* parametric, in float, done once */
  int dx = (int)(x2-x1), dy = (int)(y2-y1);
  if (abs(dx) < abs(dy)) {                  /* y-major */
    int s = (int)(dx * 65536.0 / dy), x16 = (int)(x1 * 65536.0) /* + pre-step */;
    for (i = 0, o = (int)y1*pitch; i < dy; i++, o += pitch, x16 += s) buf[(x16 >> 16) + o] += c;
  } else {                                  /* x-major */
    int s = (int)(dy * 65536.0 / dx), y16 = (int)(y1 * 65536.0);
    for (i = 0, o = (int)x1; i < dx; i++, o++, y16 += s) buf[(y16 >> 16)*pitch + o] += c;
  }
}
```

Why it is nice: no Bresenham error term, no branch in the pixel loop, **one `add [mem],reg` per pixel** that doubles as the "draw" and the additive blend, and the minor-axis
coordinate is the top half of an integer register, so `sar 16` is the rounding. Floats are only used for setup.

Honest remarks:

* The y-major loop has no multiply (it adds `pitch`); the x-major loop recomputes `(y>>16)*pitch` with `imul` **twice** per pixel (0x5dfc6 for the address and 0x5dfda for the bounds
  check). The asymmetry looks like compiler output of two source variants, not hand tuning.
* "single bounds check": `cmp eax,0x4b000 / jl` is *signed* and happens **after** the write; on failure it calls the error routine 0x28790 (strings at 0x103b40 / 0x103b46) and then
  **continues the loop** (`jmp 0x5de8f`). It is a debug assertion, the real protection is the float clip. Negative offsets pass unnoticed.
* Lines are half-open (`i < dy`, last pixel not drawn; `dy == 0` draws nothing: `cmp [esp+8],0 / je exit`).
* The y-major start x is `slope*(trunc(1-y1)+y1) + x1*65536` (0x5de44..0x5de82), i.e. a sub-pixel pre-step with a slightly odd form *(guess: intended
  `slope*(ceil(y1)-y1)`; a port must reproduce the bits as written)*.

## 3. The plane clipper driven by per-plane outcode bytes (0x592d0, 0xc58 bytes)

One function clips a triangle (three 0x24-byte vertices passed **by value**, plus a start-plane index; `ret 0x70` = 3*0x24 + 4) against 5 planes (4 frustum sides + near). Plane
`k` is `(nx,ny,nz,d)` at `[scene+0xc+0x10*k]`. First the outcodes are built (0x5940b..0x5984d; plane 1 shown):

```
5940b  xor eax,eax / mov al,[esp+0x424] / cmp eax,1 / jnl 0x594e5   ; start plane > 0 -> skip plane 0 entirely
...
59420  fld [esp+0x244] / fmul [eax+0x10]      ; v0.y * ny
5942a  fld [esp+0x240] / fmul [eax+0x0c]      ; v0.x * nx
59434  faddp / fld [esp+0x248] / fmul [eax+0x14] / faddp   ; + v0.z * nz
59442  fsub [eax+0x18]                         ; - d
59445  fstp [esp+0x250]                        ; v0.dist[0], cached INSIDE the vertex record at +0x10+4k
...  (same for v1 -> [esp+0x2e0], v2 -> [esp+0x304])
594a4  fldz / fcomp [esp+0x250] / fnstsw ax / sahf / jna 0x594b9
594b2  inc byte [esp+0x384]                    ; bit 0: v0 outside (dist < 0)
594c7  add byte [esp+0x384],2                  ; bit 1: v1 outside
594dd  add byte [esp+0x384],4                  ; bit 2: v2 outside
```

So each plane yields one byte, bit i = "vertex i is outside": **0 = inside, 7 = fully outside, 1/2/4 = one vertex out, 3/5/6 = two vertices out**. The five outcode bytes live at
`[esp+0x384..0x388]`, cleared with `xor ah,ah` + five stores (0x5935d..0x5937b). The dispatcher (0x5984d..0x59881):

```
5984d  xor ecx,ecx / jmp 0x5985b
59851  inc ecx / cmp ecx,5 / jnl 0x59e9d             ; all planes clean -> draw (section end)
5985b  cmp byte [esp+ecx+0x384],0 / jz 0x59851      ; first plane that matters
59867  mov al,[esp+ecx+0x384] / cmp eax,7 / jz 0x59ecb   ; 7: reject (return)
59877  cmp eax,1 / jz ... cmp eax,2 / jz ... cmp eax,4 / jnz 0x59b03   ; one outside -> 0x5988a, else two-outside path 0x59b03
```

Equivalent C:

```c
void clip(Tri t, int k) {                      /* planes < k are already satisfied */
  uint8_t oc[5] = {0};
  for (p = k; p < 5; p++) for (i = 0; i < 3; i++) { d[i][p] = dot(n[p], t.v[i].xyz) - n[p].d; if (d[i][p] < 0) oc[p] |= 1 << i; }
  for (p = 0; p < 5; p++) {
    if (!oc[p]) continue;
    if (oc[p] == 7) return;                    /* reject */
    if (popcount(oc[p]) == 1) { /* v = the outside vertex, a,b the others (cyclic) */
      A = lerp(v, a, t_a); B = lerp(v, b, t_b);  /* quad A a b B ... */
      clip({A, a, b}, p+1); clip({A, b, B}, p+1);          /* two triangles (vertex roles not traced) */
    } else { /* v = the INSIDE vertex */
      A = lerp(v, a, t_a); B = lerp(v, b, t_b);
      clip({v, A, B}, p+1);                    /* one triangle */
    }
    return;
  }
  draw(t);                                     /* mode 4 / 8 -> 0x5e010, mode 2 -> 0x5d840 */
}
```

Why it is clever:

* **The plane distances are cached in the vertex record** (`+0x10 + 4*k`), so the lerp weight is read back with one load, not recomputed: `t = d_v / (d_v - d_o)` is
  `fld [other+0x10+4k] / fsub [v+0x10+4k] / fld [v+0x10+4k] / fchs / fdivrp` (0x59912..0x59920).
* **That formula is symmetric**, so the *same* interpolation code serves the one-outside case (v = outside vertex) and the two-outside case (v = inside vertex): only the choice of `ebx`
  (0x59898 vs 0x59b08 ..) differs. Both are `p = v + t*(o - v)` over the 4 floats `x,y,z,w` (0x5994b..0x599a7).
* **`w` is the face shade**, so the shade is interpolated by exactly the same four `fsub/fmul/fadd` as the geometry: the clipper never knows about shading.
* **Planes already handled are never re-tested**: the recursive call passes `cl+1` (0x59a2b, `inc al`) and every outcode block is guarded by `cmp eax,k / jnl skip`. The recursion depth is
  at most 5 and each level is one plane, i.e. the structure of Sutherland-Hodgman but with triangles in/triangles out and no polygon arrays.
* The outcode byte doubles as the *switch*: 1/2/4 and 3/5/6 are three-bit patterns, so rotating which vertex plays "v" is two `lea` + two stores (0x59898..0x598fa), no sorting of vertices.

Final dispatch by scene mode byte (0x59e9d): `cmp al,4` -> 0x59e15 (calls `0x5e010`, filled), `cmp al,8` -> 0x59cf9 (calls `0x5e010` with different vertex arguments), `cmp al,2` -> 0x59d87
(calls `0x5d840`: three `0x5da58` lines). Mode 8 turned out (verified bit-exact on scene S10, frames 2468..2670) to be mode 4 **plus an outline**: a byte test at 0x59382 on `[ebp+4] == 8` calls
`0x5d840` (the mode-2 three-line routine) before clipping, and those lines are added directly into the 640-pitch screen bitmap, while the fill goes through the edge buffer and the prefix-sum resolve.
So the outline is not prefix-summed (putting it in the edge buffer gives garbage stripes).

What is not clever: the cost. Every call copies 3 x 9 dwords with `rep movsd` (0x5939f..0x593f9 and everywhere), the whole point of "triangles by value" in Watcom C++. The clipper is
~3 KB of straight-line code for what is, structurally, a 40-line function.

## 4. The shade is linear in the angle - and it *does* use acos (0x41e30, 0x59284)

The brief for this write-up listed an "acos-free shade". **That is not what the binary does**: `0x59284` is Watcom's `acos`, called from exactly two places (0x41f0a and 0x41f8e, both in
`0x41e30`). What is unusual is not avoiding the transcendental, it is *using the angle itself as the shade*, where everyone else uses the cosine.

```
41e51  mov edx,[eax+0x18]                 ; face list head (this+0x18)
41e6f  fld [eax+8] / fsub [edx+0x14] ...  ; d = light pos - face centroid          (with light: path 0x41e5c..0x41f2d)
41ea3  fsqrt / fstp [esp+8]                ; dist = |d|
41ea9  fld [esp+0x10] / fmul [edx+0x40] ... faddp ... fstp [esp+0x14]   ; n . d       (face unit normal at +0x40..+0x48)
41f02  fld [esp+0x14] / fdiv [esp+8]       ; cos = n.d / dist
41f0a  call 0x59284                        ; theta = acos(cos)
41f0f  fld [esp+4] (=16.0) / fmul qword [0x10326d] (=0.3183099524062959) / fmulp  ; theta * 16 * k, k ~ 1/pi
41f1b  fsubr [esp+4]                       ; 16 - theta*16*k
41f1f  fmul [esp]                          ; * attenuation (1 | I*0.1333 if dist<75 | I/(0.1*dist))
41f22  call 0x2874a / fistp [edx+0x38]    ; face->shade (int)
```

The constant at 0x10326d is **0.3183099524062959, not exactly 1/pi** (0.3183098861837907). With 1/pi one PALLO face at frame 1625 (v = 6.0000054) truncated to 6 where the demo gives 5, and the port was 1 grey off for 6 frames (trail decay) until the data constant was used. Always take the constants from the data, never from the maths.

The no-light path (0x41f32..0x41fa7) is the same with `d = -centroid` and `shade = trunc(256 - acos(c) * 81.487)` (`fmul [0x10324d]`, `fsubr [0x103255]`): since `81.487 = 256/pi`, the shade is
`256 * (1 - theta/pi)`, a **straight ramp in angle** from 0 (facing away) to 256 (facing the light). A cosine would be `256*(1+cos)/2`-ish: the ramp is flatter in the middle and
much brighter at grazing angles, which is a large part of the demo's flat, graphic look.

`acos` itself (0x59284..0x592c0) is:

```
59286  fld st0 / fmul st0,st0 / fld1 / fsubrp st1   ; t = 1 - x^2
5928e  ftst / fnstsw ax / sahf / jnz 0x592a4        ; t == 0 ?  -> 0 or pi  (0x59295..0x592a2: fcompp, fldz / fldpi)
592a4  mov al,1 / call 0x5d800                     ; sqrt(t) with the C library's domain check (fsqrt at 0x5d82d)
592af  fxch st1 / call 0x43067                      ; 0x43067: fxch, test [0x10bebc],1, fpatan  -> atan(x / sqrt(1-x^2)) = asin(x)
592b6  fld tbyte [0x10beb0] (=pi/2) / fsubrp st1     ; acos(x) = pi/2 - asin(x)
```

Side note, **a Watcom runtime curiosity** (not the demo authors' code): `[0x10bebc]` bit 0 is set by `0x5e557`, which divides `4195835.0 / 3145727.0` (constants `0x4150017e c0000000` and
`0x4147ffff 80000000`) and compares the result - the classic **Pentium FDIV bug test**. If the CPU is flagged, `0x43067` calls the software `atan` (0x59edc) instead of `fpatan`. *(guess on the
identification: the two constants are the famous test pair and the structure matches; the compare tail 0x5fbb2..0x60112 was not traced.)*

Observation, *not verified by running*: the light path gives `shade <= 16` (`16 - theta*16*k`), the no-light path `shade <= 256`; since `0x5e010` only keeps `(uint8)I` (`mov al,[esp+0x78]`),
a value of exactly 256 would wrap to 0. It requires `theta == 0.0` exactly, so it is practically unreachable.

## 5. The truncating cast (0x2874a)

```
2874a  push eax
2874b  fstcw [esp] / fwait
28750  push dword [esp]
28753  mov byte [esp+1],0x1f            ; control word high byte 0x1f -> RC = 11 (round toward zero), PC unchanged in low byte
28758  fldcw [esp]
2875b  frndint                          ; the cast
2875d  fldcw [esp+4]                    ; restore
28761  fwait / lea esp,[esp+8] / ret
```

Identical to `inside` (0x27a78): Watcom's `__CHP`. It is called before *every* `fistp` (all slopes, positions, intensities), so **every float->int conversion in the demo truncates toward
zero** (`Math.trunc` in a port; a round-to-nearest `fistp` would be off by one pixel on every edge). Two `fldcw` per conversion are the price of C semantics on an x87.

## 6. The scene gate: `(order, row)` compared as one integer, driven by a 4-instruction timer (0x1e044, 0x1d010, 0x1d1cb)

The demo scenes wait on the music position, not on wall-clock time. The gate (called as `0x1e044(eax = order, edx = row)`):

```
1e020  call 0x280c0                    ; poll: if player vtable present, call [vtbl+0x18] (the MIDAS/MIKIT position update)
1e02f  call 0x2816c / mov [0x10f0b4],eax   ; row
1e039  call 0x28174 / mov [0x10f0b8],eax   ; order
1e044  ...  call 0x1e020
1e056  mov eax,[0x10f0b8] / shl eax,6 / add eax,[0x10f0b4]    ; cur = order*64 + row
1e064  shl ecx,6 / add edx,ecx                                ; target = order*64 + row
1e069  cmp eax,edx / jnl 0x1e071 -> return 1 else 0
```

`(order, row)` is a lexicographic compare done as **one integer compare** by packing `order*64 + row` on both sides (XM patterns of this demo have 64 rows, *(guess: a pattern with >64 rows would
alias)*). Two shifts, two adds, one `cmp`; no branch per field. The port's equivalent is `songPos >= order*64+row` against `xm_times.json`.

The clock is equally minimal. The MIDAS timer callback (registered at 0x1d1cb: `push 0x11170 / push 1 / push 0x1d010 ... call 0x256f0`; 0x11170 = 70000 = 70.000 Hz in milli-Hz):

```
1d010  mov eax,[0x10efa0]
1d01f  inc dword [0x10efa0]            ; the whole demo clock
1d025  ret
```

and `[0x10efa0]` is zeroed once at start (0x1d1b3). Fades and the camera-track sampling (0x422e8 interpolates dense per-frame tracks at a fractional frame) are functions of this tick and
of the music row. **Interplay with MIKIT/MIDAS** (INFOFILE: "uses mikit over midas"): the *only* place the demo touches the player is the poll at 0x280c0 (`[0x10f780]` non-zero ->
`[ [0x10f888]+0x830 ] -> call [vtbl+0x18]`) *(guess: that vtable call refreshes `[0x121d00]` / `[0x121d04]`, which the getters 0x2816c / 0x28174 return)*. There is no sync to retrace in
the loops I looked at, unlike `inside` (section 14 of its write-up). Consequence for the port: a scene is a pure function of `(music position, tick)`, so seek = set the module position and re-render.

## 7. The TGA/RLE loader: mostly plain, but two details explain the buffers (0x1e4fc, 0x1e3ec, 0x1e42c)

I looked for a clever RLE decoder and there is not one - it is a per-packet `fread` loop - but the three pieces tell what the data is:

```
1e5a0  mov ah,[esp+0x18]               ; packet header byte (read with 0x28b64 = fread, 1 byte)
1e5a4  test ah,0x80 / jz 0x1e5de       ; bit 7 clear: raw packet
1e5a9  mov al,ah / xor al,0x80         ; count = (header & 0x7f) ... (xor clears the flag)
1e5ad  movzx esi,al / inc esi          ; ... + 1
       ... read ONE pixel, then `dec esi / cmp esi,-1 / jz` (count+1 times): copy via 0x28767 (memcpy), edi += bytes/pixel
1e5de  movzx esi,ah / inc esi          ; raw packet: (header)+1 literal pixels, one fread + memcpy each
```

* bits per pixel are mapped at 0x1e52e..0x1e574: 8 -> 1 byte, 24 -> read 3 / store 4, 32 -> 4/4 (`xor edx,edx` for anything else = bad file); **all 80 shipped files are 8 bpp type 11**,
  so only the `[esp+0x10] = 1` branch (0x1e556) ever runs.
* After the decode the buffer is **flipped vertically** (TGA is bottom-up): 0x1e3ec..0x1e41f copies row `H-1-y` of a temporary copy over row `y` with `memcpy` and frees the copy (0x28191).
* Then the whole image is shifted down **two bits**:

  ```
  1e42c  mov eax,[ebp+0x10]              ; pixel buffer
  1e431  xor edx,edx / mov dl,[ecx+eax]
  1e434  sar edx,2                       ; 0..255 -> 0..63
  1e437  mov [ecx+eax],dl
  ```

  `pixel >> 2` makes the 8-bit grey slide a **6-bit VGA DAC index** (VGA DAC entries are 6 bits wide, 0..63). The slides are therefore stored as ordinary 8-bit greys but displayed through a 64-entry
  region of the palette, which the demo rewrites each frame (fades, flashes). *(guess on why: it lets the additive 3D buffer, whose intensities wrap mod 256, and the slides share one
  palette fade routine, 0x1e63c. Not verified.)* The web port's PNG assets keep the raw 0..255 and shift by 2 at load (`re/NOTES.md`).

Not an optimisation, but worth knowing for the port: the decode is the dominant cost of the original's start-up (~35 k `fread` calls under emulation, six minutes in Unicorn).

---

## What I would call the best three

1. **Edge deltas + prefix sum (section 1)**: turns "fill N triangles" into "write 2 bytes per scanline" + one linear pass, and makes the renderer order-independent for free.
2. **The outcode clipper with distances cached in the vertex and a symmetric lerp (section 3)**: shade, depth and position share one interpolation; recursion only walks forward over the planes.
3. **The 16.16 additive line drawer (section 2)**: one `add [mem],reg` per pixel; but note the x-major `imul`s and the assertion that does not abort.

Honourable mention: the shade is `256*(1 - theta/pi)` - an *acos* in a 1998 intro, chosen for the look, not for speed.
