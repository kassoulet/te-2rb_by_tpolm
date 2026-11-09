# te-2rb (TPOLM, The Gathering 1998) - how the effects work

**STATUS: complete.** All 13 scenes S0..S12 (frames 0..3004, music 0:00 .. 5:00) are covered and bit-exact against the original running in an emulator (3005/3005 frames). Frames 3005..3071 (the music tail up to 307.2 s) have no picture in the original. Addresses are linear addresses of the unpacked image (see `WRITEUP-asm.md`);
constants are read from `re/data.bin` (base 0x100000). Code: `web/js/*.js`; the log of how each number was found: `re/NOTES.md`, `re/notes_3d.md`.

## The demo in one paragraph
A typographic, deliberately **black and white** 640x480 demo (INFOFILE: "is _supposed_ to be black & white 640x480", "uses mikit over midas"; VESA mode 0x101, 8 bit, UniVBE/SciTech LFB code, MIDAS sound).
Every picture is one **byte buffer of 640x480**; every layer (grain, slide, sprite, 3D) is **added** into it modulo 256, and only at the end a 256-entry grey palette (6-bit DAC) is written through the VGA ports, every frame.
All the motion that looks like "fades", "flashes" and "pulsing" is the palette, not the pixels. Images are 8 bit greys shifted right by 2 at load (0..63), so the 3D layers (intensity wraps mod 256) can be added on top and the palette folds them back into grey.

## Timeline and clock
* Clock: word `[0x10efa0]`, incremented by the MIDAS timer callback 0x1d010, registered at 70.000 Hz (0x11170 milli-Hz). Scenes wait on the music with the gate 0x1e044 (`order*64+row` compared as one integer).
* The capture steps the clock by K = 7 ticks per presented frame, so **frame k = clock 7k = music time k/10 s**. `web/data/xmrows.json` maps (order,row) -> seconds (0.16 s per row, 10.24 s per order, 30 orders = 307.2 s).
* Scene table (`scenes_2d.js START`): first loop iteration of S0..S12 = frames 0, 120, 423, 549, 820, 1080, 1364, 1669, 2048, 2260, 2468, 2671, 2772 (the first iteration of each scene except S0 is displayed black). A scene starts at the first frame whose music position reaches the exit gate of the previous scene.

| scene | frames | scene fn | content |
|---|---|---|---|
| S0 | 0..119 | 0x1edb0 | grain + apup1..7 slides, palette pulse/fade |
| S1 | 120..422 | 0x1f0f8 | grain + alku slide + TV (TEEVEE.3DS) + five random digits |
| S2 | 423..548 | 0x1f380 | grain + donot slide + "do" wire lattice, palette flash |
| S3 | 549..819 | 0x1f604 | 500yr slide + sprite + IHAVITU.3DS |
| S4 | 820..1079 | 0x1f7c4 | kikka1 slide as a trail + LAS.3DS |
| S5 | 1080..1363 | 0x1f990 | odwar slide + sprite + TPOLM3.3DS |
| S6 | 1364..1668 | 0x1fb74 | middle slide trail + PALLO sphere, solid + wire |
| S7 | 1669..2047 | 0x1feb4 | credits/love slides + EXE005.3DS, wire/solid alternating, palette flicker |
| S8 | 2048..2259 | 0x200d8 | grain (second noise buffer) + sprite + BOM.3DS, mode 4 |
| S9 | 2260..2467 | 0x202d8 | nowhere slide trail + BOM.3DS, mode 4, light on the eye |
| S10 | 2468..2670 | 0x204e0 | nowh2 slide trail + BOM.3DS, mode 8 (fill + outline), eye scale, big negative fade |
| S11 | 2671..2771 | 0x20730 | creds slide trail + TPOLM1.3DS wire |
| S12 | 2772..3004 | 0x208f4 | copyrigh slide trail + TPOLM1.3DS wire, final fade |

Gates: S8 ends at (22,4), S9 at (24,6), S10 at (26,5), S11 at (27,4), S12 at (29,22) = frame 3005. After S12 the main routine calls the shutdown (0x27d64) and prints the exit text; before S0 it shows a pre-demo slide (0x20de8, not ported, no music yet).

## The palette chain (0x1e63c: pulse 0x1eabc, fade 0x1eb70, flash 0x1ecc8, flicker 0x1ebec)
Base palette: entry e = min(e, 63) on three equal channels; the screen grey is 4 x DAC. `layers.js Palette.dac(arg, clk, row)`; `arg` is chosen by the scene at the end of each loop iteration
(`scenes_2d.js argOf`), the palette in force when frame k is shown is the one set at the end of iteration k-1 (`LAG`: S0..S2 see the row one frame earlier than S3..S8):
* **arg 0, pulse** (0x1eabc): every channel = trunc(base x f), f = float32(sin(clk x 0.04) x 0.3 + 0.8), clamped to 63.
* **arg 1..64, fade** (0x1eb70): the pulse palette x float32((65 - arg) x 0.015625), truncated. The scene computes arg from the music row, e.g. S3: `trunc(1 + (row-0x16) x c)` at order 7 from row 0x16, with the **double constant** c = 1.5238095238095237 read from the data (0x1015a1). The rounded literal 1.5238095238 gave 32 instead of 33 for row 43 - always take the exact data constants.
  Other fades: S4 `1+(row-3)*2` at order 10; S5 `1+row*3.2` at order 13; S6 `1+row*3.3684210526315788` at order 16; S7 `1+(row-0x2c)*3.0476190476190474` at order 19 from row 0x2c.
* **arg > 64**: the unmodified base palette (full white ramp).
* **arg < 0 (S10)**: the same fade formula `(65 - arg)/64` is then > 1, there is no clamp and the result goes through a byte store; the VGA DAC keeps 6 bits, so the palette is stored `& 63` (`layers.js Palette.dac`). See S10.
* **arg -7, flash** (0x1ecc8, S2, and once in S10 at order 25 row 0x13): scale s = 2 on the rows 0, 4, 8, 0xb, 0x13, 0x16, 0x26, 0x28, 0x3b (the music rows that restart it), else s = float32(sqrt(s)) per frame; palette = trunc(base x s) clamped to 63, so it decays 2 -> 1.41 -> 1.19 ... -> 1. In S10 the call happens once and 0x13 is in the row list with the flag at 0, so s = 2.
* **arg -6, flicker** (0x1ebec, S7): s = 0.6 + 0.6 cos^3(x), x = ((clk - clk0) x 3.1415 + 402.112) / 128, every store float32; trunc(base x s) clamped to 63. At the scene entry x = pi, cos^3 = -1, s ~ 0: that is why the first S7 frame is black.

## The grain (S0, S1, S2, S8; `noise.js`)
Two 4 x 640 x 480 = 1,228,800-byte noise buffers are generated once at start-up from the Watcom `rand()` (0x28716): `seed = seed x 0x41c64e6d + 12345 (mod 2^32)`, result `(seed >> 16) & 0x7fff`, seed at 0x105f4c, starts at 1, nobody calls `srand`.
* Buffer A (generator 0x22948): `(rand & 255) >> 6` per byte, then 100 runs: start `trunc((sin(rand)+1) x (N - len)) >> 2` (len = `trunc((sin(rand)+1) x 1000)`), filled with `(rand & 255) >> 4`.
* Buffer B (generator 0x22a44): `trunc(q^2 x 32)` with q = float32((rand & 255) >> 3) x 0.03125 (float32 stores), then 300 runs of zeros (len `trunc((sin(rand)+1) x 600)`), start `trunc((sin(rand)+1) x (N - len)) >> 1`.
* Per frame (0x1dd08): ONE `rand()`; offset = `trunc((sin(r) + 1) x 614400)`; the first 307,200 bytes of the screen = noise[offset ..] (wrapping around the end of the buffer). S0..S2 read B, S8 reads A (edx = 0).
  The rest of the frame is added on top (slide), so the black parts of the slide show the grain.
* `rand()` is called once per frame in frames 0..548 and **never in S3..S7**; S8 continues the sequence: frame k >= 2048 uses call number 549 + (k - 2048). To be a random-access function of k the port jumps the LCG ahead (`jump()`, square-and-multiply on the affine map) from the measured start state.

## S1: the TV and the random digits
Slide `alku` added on grain; TEEVEE.3DS (a TV on a table) is rendered into a 273 x 300 window at (189, 55) and added. Camera = target + 100 x sin(angle) per axis, angle = float32((clk - 847) x rate x 0.2), rates 0.0385 / 0.0223 / 0.0518; the light sits on the camera target. Mode 4, attenuation flag 0, focal args 0.4.
Under the TV (0x1e078) five random digits are printed at (190, 377), 61 px per glyph, from the per-digit glyph TGAs `fonts/0..9`: `n = ((clk >> 2) x 0x23ec3f mod 2^32) mod 0xf423f`, `%d`, left padded with '0' glyphs to 5 characters (a 6 digit number loses its last one).

## S2: the "do" lattice (second 3D engine; `scene_do.js`)
A different engine (0x24488 camera + splines, 0x24334 draw, 0x24a00 bend; scene object 0x10f2bc) that never calls 0x2936c. Object = 4 x 4 x 4 lattice, **36 lines with 4 control points each** (3 axes x 12 (u,v) pairs, coordinates -24, -8, 8, 24). With t = float32(clk - 7 x 423):
1. bend (0x24a00): the y,z of every control point rotate about x by the angle `x x a`, a = sin(0.0061 t) x 0.04.
2. camera: eye = 48 x normalize(sin(0.0081312 t), cos(0.006227 t), sin(0.0073823 t)); target = 16 x (sin(0.003 t), cos(0.006 t), sin(-0.005 t)); matrix = `engine.js lookAt` with columns 0/1 swapped and rows remapped (x, -z, y).
3. every line is a **cubic Bezier** sampled at i/32 (32 records), float32 stores, transformed to camera space (0x23c30).
4. pass 1, one **blob** per record: 32 x 32 texture `(sin(x pi/32) sin(y pi/32))^4 x 32`, nearest-neighbour scaled with a 16.16 DDA; the pixel is `dst + tex`, or 0x40 if that exceeds 0x40 (saturating, not additive mod 256). Column x = 639 and row y = 479 are never drawn.
5. pass 2: 31 segments per line, colour 0x20 **added mod 256** (the same line routine as `engine.js line()`).
6. projection: lines `sx = invz x x + 320, sy = invz x y + 240`, `invz = float32(192 / z)`; blobs `trunc(x x 192 x invz x 0.7) + 319 / + 239`, radius from `192 x 16 x invz x 0.0625`.

## The 3D renderer of the other scenes (`engine.js`, 0x2936c; `re/notes_3d.md`)
Not a textured/z-buffered engine: one 640x480 byte buffer, additive.
* **Mode 2**: wire, each triangle = 3 lines (0x5d840), lines add the vertex shade `w` per pixel (0x5da58: float clip, 16.16 slope, one `add [mem], dl`).
* **Modes 4/8**: filled triangles as **edge deltas**, +I on the left edge and -I on the right edge per scanline (0x5e010), then one **horizontal prefix sum** over the rect (0x29784: `acc += src[i]; dst[i] += (byte)acc`, the accumulator is not reset between rows) rebuilds the interiors. No z-buffer, no sort (the sum is commutative). I = trunc((w1+w2+w3)/3).
* **Mode 8** = mode 4 **plus** the mode-2 outline: 0x592d0 calls 0x5d840 first when `[ctx+4] == 8`. The outline lines are added **directly into the 640-pitch screen bitmap**, not into the edge buffer, so they are not prefix-summed (putting them in the edge buffer gave garbage stripes). `engine.js`: `ctx.wc` is a separate line buffer returned as `out.wire`; `scenes_3d_e.js` adds fill and wire.
* **Light position**: `scene+0xa4` = 0 puts the scene light on the camera target (S1, S3..S8), = 1 on the camera **eye** (S9..S12; 0x422e8 at 0x42a82). Scene+0xa8 (S10 only) scales the eye, see S10.
* **Shade** (0x41e30, per face): with the scene light: `d = L - centroid`, `theta = acos(n.d/|d|)` (0x59284 = pi/2 - atan(c / sqrt(1-c^2))), `shade = trunc((16 - theta x 16 x k) x att)` where `k` = the double constant at 0x10326d = **0.3183099524062959, not 1/pi** (with 1/pi one PALLO face at 6.0000054 rounded to 6 instead of 5 on frame 1625). `att` = 1 if the attenuation flag is 0, else `I x 0.1333` for dist < 75, else `I / (dist x 0.1)` with I = the per-scene value (S3 128, S4 32, S5/S7/S8 64, S6 32).
  Without a light: `trunc(256 - theta x 81.487)`.
* **Projection**: focal = W x 0.003125 x (arg x 255) (W = 640, arg = 0.4 or 0.8 or 0.6); `sx = x x (1/z) x focal + bw/2`. **Clipper** (0x592d0): 5 planes (4 sides from `atan(half/focal) - 0.0001`, near plane z = 10), outcode per plane, 7 = reject, 1/2/4 = two triangles, 3/5/6 = one, recursion on the next plane; the shade rides in the vertex w.
* **Camera** (0x422e8): look-at in the vec4 library, so the forward vector has w = 1 and is normalised with the **4-norm** (|f| ~ 0.99997); right = f x up, up = f x right from the un-normalised f. The vertex pulse (scene+0xa0, PALLO only): `scale = sin(y x 0.05 + g x 0.5) x 0.3 + 0.8` with global g (0x122644) += 0.18 after every object's vertex pass.
* **3DS loader**: vertices (x,y,z) -> (-x, z, y); object nodes of the keyframer (0xB002) are **ignored** (meshes are drawn as stored); only camera and light move.

## Keyframer camera with a Hermite quirk (S3 IHAVITU, S4 LAS, S5 TPOLM3, S7 EXE005, S8 BOM; `scenes_3d_b.js`)
The camera is the 3DS keyframer camera (position node 0xB003 + target node 0xB004, roll 0xB024; BOM has two cameras, the scene selects **"Camera02"** by its 0xB010 node name, 0x292ac). At load the demo resamples every track to one float32 sample per integer frame (0x42e88 -> 0x58a7c, 0x58f74) and 0x422e8 linearly interpolates between samples at the fractional frame.
The spline is a **Hermite** with the TCB values thrown away by the loader (tension = continuity = bias = 0: every factor is exactly 1), key frame = the low int16 of the key's frame dword, tangents
`in = ((P - Pprev) + (Pnext - P)) x (f - fp)/(fn - fp)`, `out = same x (fn - f)/(fn - fp)`. With the loop flag set (`[0x122638] = 1`) the last key's next is the first key, but the first key's previous is a **NULL key**: the walk to "last" runs past the end of the key list, so the first key's tangent is computed against frame 0 / position 0 (found by fitting the emulator's dense table, not obvious from the code).
Track time = start + arg (float32), wrapped into [start, end) by **repeated float32 subtraction**; arg per scene: S3 `clk x 0.3` (absolute), S4 `(clk - 7x820) x 0.11`, S5 `(clk - 7x1080) x 0.32`, S7 `clk x 0.5` (absolute), S8 `clk x 0.15` (absolute). Roll = track x 1/360 in radians, or, with no roll track, `cam+0x38` is multiplied **in place** by 0.0017684404124003043 on every call.
Scene setup: S3/S4/S5/S8 mode 4, focal arg 0.4 (S7 0.8, S8 0.4); S3 att 128, S4 32, S5 64, S8 64.

## S3, S5, S8: slide + sprite + mesh
S3: slide `500yr` copied, sprite `8996` (171x62) added at the bottom-left, IHAVITU added. S5: `odwar` copied, sprite `6998` at the top-right (x = 640 - w, y = 0), TPOLM3. S8: grain A, sprite `6998` at the top-right, BOM. The sprite blit (0x1de34) adds non-zero pixels mod 256 without clipping.

## S4 and S6: trails (`trail()` in `scenes_2d.js`)
Each loop iteration does `buf = (buf + slide) >> 1` and then the 3D layers are added **into the same buffer** (S4: kikka1 + LAS; S6: `middle` (0x1fc28, `[0x10f144]`) + PALLO). The buffer is not cleared: it carries over from the previous frame (and for the first iteration from the previous scene's last buffer: S5's for S6, S3's for S4), so every frame depends on all the earlier frames of the scene (an exponential average, ~7 frames of memory, but exact to the byte after the integer truncations).

## S6: PALLO (pulsating sphere, 146-vertex UV sphere)
Per frame, after the trail averaging, two renders into the same buffer: **mode 4** (att 32, focal 0.8, the roll seen by 0x422e8 is raw x BANK) then **mode 2** (att 32, focal 0.6, roll raw x BANK^2, almost zero). Both with the same procedural camera: f_i = float32(clk x {0.0031, 0.0021, 0.0011}), target = (sin f1, cos f0, sin f2) x 50, eye = sin(f_i) x 200, bank = sin(4 f2) x 400. The pulse phase g advances by 0.18 per render call (2 per frame), float32 accumulated, so it is replayed from the anchor 2521.349365234375 at frame 1364. Bug found on the way: the wire buffer is only 640 x 479 long; adding 640 x 480 indices produced NaN -> 0 on the last row.

## S7: EXE005 (credits over a sphere with a bump material and 9 'MOB' triangles)
The buffer is **overwritten** each iteration with a slide: index `((clk - clk0) >> 8) mod 11` into cred1..cred8, love, love, love (0x1ff01); the parity of that index picks the mode: odd -> mode 4, even -> mode 2 (att 64, focal 0.8, 3DS keyframer camera, arg = clk x 0.5). Palette: the flicker (-6) until order 19 row 0x2c, then the fade. The material names (BUMP, MOB) suggested bump mapping in the first notes; the port reproduces the frames with the same additive mesh engine and never reads materials.

## S8: BOM
Order 20 row 0 .. order 22 row 4 (frames 2048..2259). Grain from buffer A, sprite 6998, BOM.3DS (6 meshes of 72 vertices, cameras Camera01/Camera02, the demo picks Camera02), mode 4, att 64, focal 0.4, `arg = clk x 0.15`, added mod 256. Palette: pulse until order 21 row 0x30, then the fade `1 + (row - 0x30) x 3.2`, then at order 22 rows 0..4 `1 + (row + 16) x 3.0476190476190474` (read from code 0x20226..0x2029d; verified on frames 2150..2259, where the oracle `golden_d` continues). S8 ends at gate (22,4); frame 2260 is S9's black opening frame.

## Why seeking works
The scene index, the fade argument and the animation are functions of (music order/row, 70 Hz clock), and the clock is a function of the frame: **a frame is a pure function of its index k** (music time k/10 s). So seek = set the module position (libopenmpt `setPos`) and render frame `round(t x 10)`. Where the original keeps state, the port recomputes it:
* grain: jump-ahead of the LCG (no replay);
* palette flash (S2): replayed from S2's first iteration (`flashScale`, a few hundred float32 steps);
* PALLO pulse phase g: float32 accumulation replayed from the anchor (`palloG`);
* camera tracks: pure functions of the clock (sampled dense tables).
* **Caveat, the trail scenes S4, S6, S9, S10, S11, S12**: a frame depends on the previous frame's buffer. The port keeps the last rendered frame per scene and continues forward when the next frame is the following one, otherwise (seek, or a backward move) it **replays the trail from the scene start**, and the first averaging starts from the previous scene's last buffer (`accOf(START[s]-1)`, recursive). S4 and S6 replay at most ~300 frames; S10, S11 and S12 chain back through S9 (S9 starts from S8's single frame), so the last frame of S12 replays S9..S12 = 745 frames. Measured in node on this machine, cold (one frame including start-up of about 0.15 s): about 1.0 s for the end of S6 and about 1.7 s for the end of S12 (worst case). Not measured in a browser.

## S9..S12: the trail scenes of the ending
All four use the S4/S6 trail rule `buf = (buf + slide >> 2) >> 1` (first iteration starts from the previous scene's last buffer), then the 3D layer is added mod 256 in place. No grain, no sprite. All have `scene+0xa4 = 1` (light on the eye).
* **S9** (0x202d8, order 22 row 4 .. 24 row 6): slide `nowhere` ([0x10f148]), BOM.3DS with "Camera02", **mode 4, att 32** (S8: 64), focal 0.4, track time clk x 0.15. Palette: arg 0 until order 23 row 0x32, then `1 + (row - 0x32) x 3.0476190476190474` (fade out), at order 24 rows 0..6 `1 + (row + 14) x 3.0476...` (hold).
* **S10** (0x204e0, order 24 row 6 .. 26 row 5): slide `nowh2`, same BOM/Camera02/att 32/0.4/clk x 0.15, but **mode 8** (fill + outline). Two extras:
  * **Eye scale a8** (0x42aea..0x42b51): once `order*64 + row > 1604.0f` (float 0x44c88000, i.e. order 25 row 5, not row 0), `clk_first` = the clock stored in that iteration and `a8 = float32((clk - clk_first) x 0.002)`; the first frame that sees it (2568) has a8 = 0, 2569 is the first scaled one. The eye is multiplied by `(1 + a8)` per component (float32 stores), the light is taken on the **unscaled** eye, the target is not scaled. The camera slowly pulls away.
  * **Palette**: from order 25 row 4 to order 26 row 5 the fade arg is `trunc(1 + (row - 0x1c) x 0.9846153846153847)`. It is **negative** for the first part (-22 at order 25 row 4), so the scale `(65 - arg)/64` is above 1, nothing clamps it and the DAC wraps (`& 63`): the picture is not a fade there. Two special values occur once each: row 0x13 gives arg -7 (the flash, scale 2) and row 0x14 gives arg -6 (the cos flicker, with S7's `clk0`).
* **S11** (0x20730, order 26 row 5 .. 27 row 4): slide `creds` ([0x10f128]), **TPOLM1.3DS** (the only mesh of the ending; its one camera Camera01, picked by 0x292e0 = first camera), **mode 2** (wire into the 640-pitch buffer, 639 x 479 window, like S7), att 128, focal 0.4, clk x 0.15 (absolute clock). Palette: arg 0 until order 27, then `trunc(1 + row x 16)` (0x1016d9) for rows 0..3.
* **S12** (0x208f4, order 27 row 4 .. gate (29,22)): slide `copyrigh` ([0x10f164]), same TPOLM1 wire layer. Palette: arg 0 until order 29, then `trunc(1 + row x 2.909090909090909)` (0x1016f1); the last frame (3004, row 21) has arg 62, i.e. 3/64 of the white ramp: nearly black, not exactly. The scene ends when gate (29,22) is true (frame 3005); the other test, gate (1,10), only aborts if the music restarted.
LANDCRUI.3DS and TPOLM2.3DS are loaded by the demo but used by nothing: the functions that would draw them (0x20acc, 0x20c8c, 0x20e7c) are not in the main call list (0x1d265..0x1d2a1).

## What is exact, what is not
* Exact: all 3005 frames, 0 differing pixels (`tools/cmp2d.py` against the six golden directories; see `README.md` for the per-scene table).
* Not exact or not tested: `sin`/`cos`/`sqrt`/`atan` are JS doubles, not the x87 (1-ulp risk is theoretical: none seen on 3005 frames); camera and paths are verified only on the golden run (virtual 7-ticks-per-frame clock); frames 3005..3071 have no picture in the original (the player holds the last, near black frame); dead functions 0x20acc/0x20c8c/0x20e7c and the pre-demo slide 0x20de8 are not ported; the audio is libopenmpt, only checked to the extent that the music-position feed of the golden run works, not sample by sample.
* Later: a WebGL rework (additive blending, resolution independent) is on the list; the faithful 640x480 JS port stays the reference.
