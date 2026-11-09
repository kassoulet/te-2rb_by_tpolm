# tpolm2rb (te-2rb): 3D renderer, static analysis

Addresses are in code.dis (code base 0x20000-style linear addresses as printed there), data in data.bin (base 0x100000).
Items marked (guess) are not verified. Static analysis only, nothing was emulated. code.dis is a linear disassembly and
is desynchronised at a few function starts (0x59284, 0x5d800/0x5d840): treat those starts as approximate.

## 1. Overall model

Watcom C++ 32-bit, float32 x87 code, 640x480x8 VESA. The 3D engine is a small wireframe/edge-delta renderer, NOT a textured
or z-buffered one:

- One byte buffer (640*480 = 0x4b000, scene+0x68), cleared each frame (memset 0x28498).
- Mode 2: additive wireframe (lines add intensity, byte wraps mod 256).
- Modes 4 and 8: filled triangles drawn as edge deltas (+I at left edge, -I at right edge), then a horizontal prefix sum
  (resolve 0x29784) reconstructs interiors mod 256. No z-buffer, no sorting, overlaps add up (commutative, so order independent).
- Flat shading per face from the angle between normal and light (linear in angle, via acos, not a cosine).
- Colour comes only from the 8-bit value, via the palette set elsewhere (fade/palette 0x1e63c, guess on exact mapping).

## 2. Pipeline and key functions

| Address | Role |
|---|---|
| 0x29110 | scene ctor (0xac bytes), loads a 3DS file; called from 0x210a4 for bom, teevee, pallo, las, landcrui, ihavitu, exe005, tpolm2, tpolm3, tpolm1 |
| 0x294c8 | post-load init: per-face normals (0x420f4), records first light (+0x88) |
| 0x2936c | render(this, camera, w, h, args...): sets frame (+0x9c), clears buffer, builds 5 clip planes (0x29668), computes focal, mode byte (+0), object loop |
| 0x422e8 | per-frame camera: samples dense tracks at frame, builds look-at matrix, stored at scene+8 |
| 0x41bdc | vertex transform (view matrix * (x,y,z,1)) into vertex +0x10..+0x18; optional pulse (scene+0xa0) |
| 0x41e30 | per-face shade into face+0x38 |
| 0x41fe4 | face loop, hands 3 vertices (w = shade) to the clipper |
| 0x592d0 | recursive clipper against 5 planes (4 sides + near), outcode bytes |
| 0x5d840 | mode 2 triangle: project + 3 lines |
| 0x5da58 | additive line drawer, 16.16 fixed point |
| 0x5e010 | modes 4/8 triangle, edge deltas |
| 0x29784 | resolve: horizontal prefix sum over the bitmap rect |
| 0x2874a | float -> int truncation helper (control word 0x1f set, frndint) |

Call sites of 0x2936c use mode 4 (most), 2 (0x1fdb9, 0x1ffc6, 0x207e6, 0x209aa), 8 (0x205ac, 0x20d41). Mode 8 = mode 4 fill PLUS the mode-2 triangle outline (0x592d0 calls 0x5d840 first when [ctx+4]==8), the outline lines being added directly into the 640-pitch screen bitmap, not into the edge buffer (so not prefix-summed). Verified bit-exact on S10 (NOTES.md 'Extension to frames 2150..2499'). 0x20d41 is in a dead function (0x20c8c, never called).
Extra float args seen: 0.4 (0x3ecccccd), 0.8 (0x3f4ccccd), 0.6 (0x3f19999a), end values 32.0, 64.0, 128.0, 24.0, 0 (guess: light intensity / scale / fov-ish).

### Scene functions (demo parts)
0x1edb0, 0x1f0f8, 0x1f380, 0x1f604, 0x1f7c4, 0x1f990, 0x1fb74, 0x1feb4, 0x200d8, 0x202d8, 0x204e0, 0x20730, 0x208f4, 0x20de8.
They call the scene gate 0x1e020/0x1e044 (order/row), fade 0x1e63c, keyboard 0x29044/0x2905b. Clock word 0x10efa0, 70 Hz.

## 3. Data structures

### Scene (0xac bytes)
+0 mode byte (2/4/8), +4 attenuation flag, +8 view matrix ptr, +0xc 5 planes (nx,ny,nz,d, 0x10 each),
+0x5c bitmap object (+0 data, +4 pitch, +0xc width, +0x10 height, +0x14/+0x18 offset), +0x60/+0x64 focal scales (w/320*arg*255, h/240*arg*255, guess on exact meaning),
+0x68 byte buffer 0x4b000, +0x70/+0x74 camera list head/tail (next at cam+0x40), +0x78/+0x7c object list (next obj+0x20),
+0x80/+0x84 light list (next light+0x18), +0x88 first light, +0x8c =15.0f, +0x90/+0x94 frame range, +0x98 loop flag,
+0x9c current frame (float), +0xa0 vertex pulse flag, +0xa8 optional scale.

### Vertex (0x28 bytes, ctor 0x29b54)
+4,+8,+0xc local xyz, +0x10,+0x14,+0x18 camera-space xyz, +0x24 next. 3DS (x,y,z) is loaded as (-x, z, y).

### Face (0x50 bytes, ctor 0x58938)
+4,+8,+0xc vertex ptrs, +0x14..+0x1c centroid (average * 1/3), +0x38 int shade, +0x40..+0x48 unit normal, +0x4c next.
Indices resolved by linked-list walk 0x41fb8.

### Camera (ctor 0x42210, 0x44 bytes)
+0x14 dense position table, +0x18 target table, +0x1c roll table, +0x20..+0x28 source, +0x2c..+0x34 target, +0x38 bank, +0x3c fov, +0x40 next.
Light (ctor 0x42f60): pos at +8,+0xc,+0x10.

### 3DS loader
Chunks: 0x419e4 top (0x4d4d), 0x412d4 EDIT (0x3d3d), 0x41244 dispatch, 0x410b4 object (0x4000), mesh 0x4100,
vertices 0x40f38 (0x4110), faces 0x40fd8 (0x4120: 3 u16 + flags), camera 0x411a4 (0x4700), light 0x41148 (0x4600).
Keyframer 0x41888 (0xB000; 0xB003 camera node, 0xB004 target node, 0xB008 segment), 0x4176c/0x417ec/0x41858 (0xB010 name, 0xB020 position track, 0xB024 roll).
Primitives: u16 0x5881c, float 0x5887c, position track resample 0x58a7c (TCB or spline), roll 0x58f74. 0x42e88 resamples tracks to one sample per integer frame ((n+1)*12 bytes).
Object nodes (0xB002) are not parsed: only camera and light move (guess).

## 4. Algorithms

Camera 0x422e8 (size 0xba0): interpolate dense tracks at fractional frame (lerp 0x297f8), optional scale, look-at matrix.

Shading 0x41e30 (stored as int at face+0x38):
- with light: d = L - centroid, dist = |d|, cos = n.d/dist, theta = acos(cos); shade = trunc((16 - theta*16*k) * att), k = double at 0x10326d = 0.3183099524062959 (not 1/pi);
  att = 1 if scene+4 == 0, else I*0.1333 if dist < 75.0, else I/(dist*0.1).
- without light: d = -centroid, shade = trunc(256 - theta*81.487) (= 256*(1-theta/pi)).
Constants: 0x10324d=81.487 (256/pi), 0x10326d=0.3183099524062959 (close to 1/pi = 0.31830988618 but NOT equal; with 1/pi PALLO frame 1625 is off, see NOTES.md), 0x103265=0.1333, 0x10325d=0.1.

Vertex pulse (when scene+0xa0): scale = sin(y*0.05 + g*0.5)*0.3 + 0.8 (y = the vertex's local y, as in engine.js line 92; an earlier version of this note said x, wrong), g = global 0x122644 += 0.18 after every object's vertex pass (0x41e16), i.e. per render call per object, not per frame (consts 0x103225/22d/235/23d/245).

Clipper 0x592d0 (~0xc58 bytes): signed distances n.p - d to planes 0..4 (side planes from fov, near plane (0,0,1,-10)), outcode byte per plane at [esp+0x384+k].
7 = all outside, reject; 1/2/4 = one vertex outside: split into two triangles and recurse with plane index+1; 3/5/6 = two outside: one triangle.
Final dispatch by mode: 4 -> 0x59e15 -> 0x5e010, 8 -> 0x59cf9 -> 0x5e010, 2 -> 0x59d87 -> 0x5d840. Vertex w carries the shade through clipping.

Projection (0x5d840, 0x5e010): reject if any w <= 0; sx = x*(1/w)*focal + bitmapW*0.5, sy = y*(1/w)*focal + bitmapH*0.5.

Line 0x5da58: float clip to the bitmap, major axis, 16.16 slope (*65536.0, sar 16), per pixel `add BYTE [buf+..], dl`; bounds check against 0x4b000 (error call 0x28790).

Triangle 0x5e010: intensity = trunc((w1+w2+w3)*(1/3)) byte, sort by y (3 swap blocks), float slopes converted to 16.16, two passes
(top-mid, mid-bottom); per scanline `add BYTE [row+(xl>>16)], I` and `sub BYTE [row+(xr>>16)], I`.

Resolve 0x29784: `acc += src[i]; dst[i] += (byte)acc` over the bitmap rect.

## 5. Comparison with inside (inside/web/js/engine3d.js, inside/re/notes_engine.md)

| inside (engine3d.js) | tpolm2rb | Reusable? |
|---|---|---|
| fixed-point triangle setup, 3x3 double matrices | float32 x87, 4x4 look-at, 5-plane clipper | no |
| six mappers (0x30e5c, 0x2edb0, 0x2e264, 0x3269c, 0x32dc8, 0x332e0), self-modifying inner loops | one byte-add edge-delta filler + prefix sum | no |
| radix sort of faces | none (additive, commutative) | not needed |
| gouraud lighting, env uv | flat per-face angle shade | no |
| float->int helper (inside 0x27a78) | 0x2874a, same truncation convention | idea: Math.trunc |
| animation as pure function of music position | camera tracks pure in frame number | idea: seek = set frame |
| scene/camera framing, 4:3 display, player pause/seek | same needs | reuse the player shell |

Conclusion: no shared code or algorithm with inside's engine. Nothing in engine3d.js can be reused as is. The port is a new small module:
3DS parser + keyframe resampler, float32 math via Math.fround, additive Uint8 buffer, edge-delta fill, prefix sum, 5-plane clipper.
(Update: mode 4 vs 8, palette mapping, per-scene 3DS/camera choice and the focal formula were all settled later by the port; see NOTES.md.)

## 6. S3/S4/S5 meshes (verified bit-exact, web/js/scenes_3d_b.js)
S3 = IHAVITU (fn 0x1f604, scene [0x10f2a4], att 128, arg = clk*0.3), S4 = LAS (0x1f7c4, [0x10f29c], att 32, arg = (clk-clk0)*0.11), S5 = TPOLM3 (0x1f990, [0x10f2b0], att 64, arg = (clk-clk0)*0.32); clk0 = clock of the scene's first loop frame (7*820, 7*1080). All mode 4, fx=fy=0.4, bitmap 639x479 in the 640-pitch screen buffer.
- Camera = 3DS keyframer camera, NOT procedural: pos track (node 0xB003/0xB020), target track (0xB004/0xB020), roll (0xB003/0xB024, *1/360, else cam+0x38*=0.0017684 per call). Track time = start + arg wrapped into [0xB008 start,end) by repeated float32 subtraction. Light = scene light put on the target (scene+0xa4==0). Object nodes (0xB002) really are ignored (confirmed).
- Dense tables (0x58a7c/0x58f74): Hermite, TCB values discarded (all 1.0), frame = low i16 of the key frame dword; tangent_in = ((P-Pp)+(Pn-P))*(f-fp)/(fn-fp), tangent_out = same * (fn-f)/(fn-fp). Loop flag [0x122638]=1: last.next = first, but first.prev is a NULL key (the walk to "last" runs past the list end): position 0, frame 0 (found by fitting the emulator's dense table).
- Oracle: probe at 0x2936c (re golden_ff ckpt_55/65/75/80/105) = 0 differing bytes in the edge buffer; cmp2d.py 550 1199: all frames exact (786/787 were the palette arg constant, fixed; see NOTES.md 'Extension to frames 1200..1699'). Face shade uses 16/pi = 0.3183099524062959 (0x10326d), not 1/pi.

## 7. S6 PALLO mode 4 + S7 EXE005
See NOTES.md 'Extension to frames 1200..1699'. PALLO mode 4: att 32, fx=fy=0.8, bank*BANK once (wire: BANK^2), pulse g shared with the wire call; EXE005: 3DS keyframer camera (arg = clk*0.5), att 64, fx=fy=0.8, mode 2 (pitch 640 window 639x479) or mode 4 by parity of (clk-clk0)>>8.
