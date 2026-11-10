# tpolm2rb - TPOLM "te-2rb" (The Gathering 1998 party version) - recon

Files: `DEMO.EXE` (245,933 B), `TE-2RX.XM` (964 KB), 10 x `.3DS`, `DATA/*.TGA` (29 full-screen 640x480 8-bit RLE greyscale slides, 2 x 171x62 sprites, `DATA/FONTS/*.TGA` = one TGA per glyph incl. words: CLOSE, EQUAL, HOMO1, OPEN, PLUS, POINT, QUOTE, SHOUT, SLASH, WHAT).
INFOFILE: "uses mikit over midas", "is _supposed_ to be black & white 640x480", "the music starts playing after we have your attention". Credits are in the demo (CRED1..8 slides: programming Kalle Kananen/raven, music Jaakko Manninen/md, graphics Antti Jaderholm/feather, objects Lassi Nikko/dune + Wojtek Podgorski/unreal, code/player Jean-Paul Mikkers (MikMod/mikit), Rune Vendler/echo, thanks).

## Unpacking (same toolchain as b-hyper / inside)
DEMO.EXE has the identical MZ stub as HYPER.exe: PMODE/W 1.33 (stage-1 LZ + `PMW1` overlay). `re/unpack_pmodew.py` (copy of inside's, two int21 / int2f stubs added: 0x44xx ioctl, 0x63/0x65/0x49, int2f AX=BC00 -> not installed):
`python3 re/unpack_pmodew.py 100 DEMO.EXE 11520 0x3d7 re/mem0.bin 0x2819c` -> `mem0.bin` = 64 MB memory at the program entry **0x2819c** (jmp over the string 'WATCOM C/C++32 Run-Time system', Watcom 32-bit).
Without the stop address the same run goes on into the demo's own start-up (it opens tpolm1.3ds, data\5tpolm.tga... - my int21 open stub returns DEMO.EXE for every file, so it dies at the first TGA read; a real file backend is the first thing the harness needs).
Memory map: code object 0x1b000-0x68000 (`re/code.bin`, ~300 KB), data/bss from 0x100000 (`re/data.bin` = 0x100000-0x10f000; more at 0x13a000). Rebuilt files are not in git (mem0.bin is 64 MB).

## What the binary says (strings in data.bin)
- Libraries: **MIDAS** (error strings "MIDAS error: %s", "BIG PANIC! MIDASclose Failed"), **UniVBE / SciTech** LFB code ("load univbe", `DPMI_mapPhysicalToLinear`, "Usage: LFBPROF <xres> <yres>", "Available 256 color video modes: %4d x %4d %d bits per pixel") -> 8-bit linear-framebuffer VESA mode, 640x480.
- A "wait.." / "Please wait.." progress text, then the load order: `bom.3ds teevee.3ds pallo.3ds las.3ds landcrui.3ds ihavitu.3ds exe005.3ds tpolm2.3ds tpolm3.3ds tpolm1.3ds`, then the TGAs (5tpolm, 500yr, creds, donot, middle, nowhere, copyrigh, secret, kikka1, nowh2, alku, odwar, cred1-8, love, apup1-7, 6998, 8996, attenz, fonts\*).
- Embedded text: "Recorded live at Pengerkadun maatalouskone ja s...", "we love tpolm.", "http://www.tpolm.scene.org/", a `$`-art TPOLM logo.

## Content (contact sheet `re/contact_tga.png`)
A typographic, black-and-white demo: full-screen slides (big glyph cut-outs, credits, "ATTENZIONE usa la cuffia", the (c) tpolm. card, "we love you.") alternating with 3D scenes. 3DS meshes (`python3 tools/parse3ds.py FILE.3DS`):
BOM (6 meshes of 72 verts + 2 fillers, 2 cameras, 3 lights), TEEVEE (a TV on a table: wooden legs, GOLD, textures SIVU5.GIF / ASHSEN.GIF - the GIFs are **not** shipped), PALLO (a 146-vert UV sphere), LAS (a loft of 348 verts + a line), LANDCRUI (961-vert mesh), IHAVITU (574 verts), EXE005 (956-vert UV sphere with material BUMP + 9 triangles 'MOB'), TPOLM1/2/3 (the logo; 'unreal' = 1024-vert object + 9 small ones with camera/lights).
Most meshes have no keyframer data worth a first look; EXE005's material names (BUMP, MOB) suggest bump mapping / motion blur - to verify in code.

## Harness (re/emucore.py, re/boot.py) - boots the ORIGINAL to its first frames
`emucore.py` = b-hyper's Unicorn core adapted (no capstone): DOS file backend over the demo folder (case/backslash-insensitive), **lowest-free file handle** (Watcom's FILE table has 20 slots; never-reused handles made `fopen` fail with "data\creds.tga not found"), DPMI (selectors, DOS memory, physical mapping -> LFB 0x20000000), VBE 4F00/4F01/4F02 (mode 0x101 = 640x480x8), VGA palette capture (ports 0x3c8/0x3c9 -> `E.PAL`), no-sound.
`python3 boot.py 12000` (12 G instructions, ~6 min, Unicorn ~34 M instr/s): loads 10 x 3DS + all TGAs (the TGA/RLE decode is the expensive part, ~35k file reads), prints the mode line ("640 x 480 x 8"), sets VBE mode 0x4101 and renders; dumps the framebuffer to `boot_fb.png` and a snapshot `state.bin` (not in git).
First real frame: the "bx(+z:" slide over a noisy background (looks intentional: the INFOFILE says it is "supposed to be black & white"; noise/scan lines are part of the effect). Palette = 256 entries written through the VGA ports.

## Resume + virtual clock (step 1 done): re/golden.py
- Pacing: the demo clock is the word at **0x10efa0**, incremented by the MIDAS timer callback **0x1d010** (`inc [0x10efa0]`), registered at 0x1d1cb with rate 0x11170 = 70.000 Hz (`push 0x11170; push 1; push 0x1d010 ... call 0x256f0`). The emulated machine never fires it, so the harness advances it by hand. The main loop polls the keyboard with int21 AH=0Bh (`0x29044`) once per frame.
- Present: 13+ per-scene presenters (0x1f099, 0x1f2e9, 0x1f5b1, 0x1f6e5, 0x1f8af, 0x1fa99, 0x1fded, 0x1fffa, 0x201bd, 0x203c7, 0x205e0, 0x2081a, 0x209de, 0x20baa, 0x20d75 ...) each end with `rep movs dword es:[edi],[esi]` into the LFB selector. `golden.py` hooks the instruction after each `rep movs`, dumps the 640x480x8 framebuffer + the captured palette to PNG and advances the clock by K ticks (default 2 = 35 fps).
- `python3 golden.py OUTDIR NFRAMES [K]`: resumes `state.bin` (boot.py snapshot at the first frames) - no 6 min load. ~1 s per frame (200 frames in 3 min 22 s).
- First 200 frames (5.7 s of demo time): the same "bx(+z:" slide with a flickering noise field and horizontal streaks, brightness pulsing (the loop at 0x1f053 adds the slide bytes into an accumulation buffer `[0x10f104]`, 0x4b000 = 640*480 bytes, picks a fade factor 1.0 / 20.0 / 43.0 by scene index `[0x10f0b4]`, copies it to the LFB, then calls `0x2874a` (float -> int, `fistp`) and `0x1e63c` (palette fade?)). The scene index never advanced in these frames: something else gates the next scene (music position / key / a longer timeline), to find.

## Next steps
1. Find what advances scene index `[0x10f0b4]` and the timeline (xref `0x10f0b4` writers; MIDAS position callback / `MIDASgetPlayStatus` equivalent - replace with a lookup in the XM row/time table as in b-hyper `xm_times.json`).
2. Run the golden harness over the whole demo (long: ~1 s/frame -> checkpoint snapshots every N frames, as b-hyper's `golden.py CKPT=`).
3. TGA RLE decoder (0x1e1c0), 3D pipeline, JS player (640x480 at 4:3, pause + seek, XM via libopenmpt) + write-ups.

## Scene gate (found)
- Scenes wait on music position: `0x1e044(eax=order, edx=row)` returns 1 when `[0x10f0b8]*64+[0x10f0b4] >= order*64+row`; `[0x10f0b4]`=row, `[0x10f0b8]`=order, copied from `[0x121d00]`/`[0x121d04]` by getters 0x2816c/0x28174.
- Those are written by 0x27d34, which is only reached through the player vtable, so hooking it does nothing. `golden.py` now hooks the poll entry **0x280c0** and feeds row/order from `xm_times.json` (virtual time = ticks/70, `T0` env = start offset).
- Result: with the hook, 300 frames x 5 ticks (21 s) show the typographic scenes ("te-2rb." / giant 5 / 7); frames ~200+ are black (fade or stall, EIP 0x59e87), not yet analysed.

## Harness caveats found later (golden.py is NOT yet a trustworthy reference)
- `emucore.LFB = 0x3f00000` is the emulated screen; `0x20000000` (ARENA, what golden.py dumps) is the malloc arena, so the frames captured so far are arena contents, not proven screen output.
- The `rep movs` presenter regex also matches struct copies in the 3D code (e.g. 0x42080, 0x59e37); with a per-present clock those false hits drove the clock. Filtering to real LFB copies (EDI near 0x3f00000) stops the clock, so the clock must come from a timer (golden.py now ticks every `BPT`=20000 basic blocks; ~70 ticks/s virtual) and frames must be tagged with their tick.
- Only hook 0x1f0a0 fired in the first 3M blocks; the real presenters and the frame boundary (probably the copy that reaches LFB+640*480) are still to be identified.
- Still to do: dump LFB with the current palette on real presents, resample to a fixed grid by tick, then diff against a JS port.

## Assets
All decoded by `tools/tga2png.py` (TGA) and `tools/export3ds.py` (3DS, uses `tools/parse3ds.py`) into `web/data/tex/*.png` and `web/data/mesh/*.json`. Nothing undecodable.

TGA decoder (0x1e1c0 header + 0x1e4fc RLE): reads 18-byte header, skips id, 8 bpp type 11 only (type 1/2/10 branches 0x1e454/0x1e4fc exist but **no shipped file uses them**: all 80 files are type 11, no colour map, origin bottom-left, 8 bpp). Packet: b&0x80 -> repeat next byte (b&0x7f)+1, else b+1 literals. Afterwards the demo flips rows (bottom-up -> top-down, 0x1e3ec) and does `pixel >>= 2` over the whole image (0x1e42c) = 6-bit VGA palette index (0..63). PNGs keep the raw 0..255 values (top-down); shift by 2 to get the demo's buffer. Check: for 29 of the 640x480 slides a middle row of the decoded+flipped+>>2 image is found verbatim in the emulator RAM (`state.bin`).

| file | format | size | purpose guess |
|---|---|---|---|
| DEMO.EXE | PMODE/W Watcom 32-bit | 245,933 | the demo |
| TE-2RX.XM | XM module | 964,359 | music (MIDAS) |
| FILE_ID.DIZ / INFOFILE | text | 89 / 1,271 | release info |
| BOM.3DS | 3DS R3/R4 | 29,168 | 3D scene, see Content / web/data/mesh/bom.json |
| EXE005.3DS | 3DS R3/R4 | 45,915 | 3D scene, see Content / web/data/mesh/exe005.json |
| IHAVITU.3DS | 3DS R3/R4 | 22,210 | 3D scene, see Content / web/data/mesh/ihavitu.json |
| LANDCRUI.3DS | 3DS R3/R4 | 37,456 | 3D scene, see Content / web/data/mesh/landcrui.json |
| LAS.3DS | 3DS R3/R4 | 13,922 | 3D scene, see Content / web/data/mesh/las.json |
| PALLO.3DS | 3DS R3/R4 | 6,745 | 3D scene, see Content / web/data/mesh/pallo.json |
| TEEVEE.3DS | 3DS R3/R4 | 20,471 | 3D scene, see Content / web/data/mesh/teevee.json |
| TPOLM1.3DS | 3DS R3/R4 | 10,995 | 3D scene, see Content / web/data/mesh/tpolm1.json |
| TPOLM2.3DS | 3DS R3/R4 | 77,790 | 3D scene, see Content / web/data/mesh/tpolm2.json |
| TPOLM3.3DS | 3DS R3/R4 | 51,045 | 3D scene, see Content / web/data/mesh/tpolm3.json |
| DATA/500YR.TGA | TGA RLE grey 640x480 | 124,298 | full-screen slide |
| DATA/5TPOLM.TGA | TGA RLE grey 640x480 | 17,909 | full-screen slide |
| DATA/6998.TGA | TGA RLE grey 171x62 | 1,517 | sprite |
| DATA/8996.TGA | TGA RLE grey 171x62 | 1,517 | sprite |
| DATA/ALKU.TGA | TGA RLE grey 640x480 | 9,907 | full-screen slide |
| DATA/APUP1.TGA | TGA RLE grey 640x480 | 8,693 | full-screen slide |
| DATA/APUP2.TGA | TGA RLE grey 640x480 | 30,609 | full-screen slide |
| DATA/APUP3.TGA | TGA RLE grey 640x480 | 60,510 | full-screen slide |
| DATA/APUP4.TGA | TGA RLE grey 640x480 | 62,149 | full-screen slide |
| DATA/APUP5.TGA | TGA RLE grey 640x480 | 73,846 | full-screen slide |
| DATA/APUP6.TGA | TGA RLE grey 640x480 | 118,109 | full-screen slide |
| DATA/APUP7.TGA | TGA RLE grey 640x480 | 97,977 | full-screen slide |
| DATA/ATTENZ.TGA | TGA RLE grey 640x480 | 22,347 | full-screen slide |
| DATA/COPYRIGH.TGA | TGA RLE grey 640x480 | 17,066 | full-screen slide |
| DATA/CRED1.TGA | TGA RLE grey 640x480 | 62,884 | full-screen slide |
| DATA/CRED2.TGA | TGA RLE grey 640x480 | 296,531 | full-screen slide |
| DATA/CRED3.TGA | TGA RLE grey 640x480 | 309,333 | full-screen slide |
| DATA/CRED4.TGA | TGA RLE grey 640x480 | 299,622 | full-screen slide |
| DATA/CRED5.TGA | TGA RLE grey 640x480 | 309,051 | full-screen slide |
| DATA/CRED6.TGA | TGA RLE grey 640x480 | 295,031 | full-screen slide |
| DATA/CRED7.TGA | TGA RLE grey 640x480 | 294,798 | full-screen slide |
| DATA/CRED8.TGA | TGA RLE grey 640x480 | 293,862 | full-screen slide |
| DATA/CREDS.TGA | TGA RLE grey 640x480 | 25,912 | full-screen slide |
| DATA/DONOT.TGA | TGA RLE grey 640x480 | 12,147 | full-screen slide |
| DATA/KIKKA1.TGA | TGA RLE grey 640x480 | 38,153 | full-screen slide |
| DATA/LOVE.TGA | TGA RLE grey 640x480 | 301,479 | full-screen slide |
| DATA/MIDDLE.TGA | TGA RLE grey 640x480 | 244,692 | full-screen slide |
| DATA/NOWH2.TGA | TGA RLE grey 640x480 | 286,030 | full-screen slide |
| DATA/NOWHERE.TGA | TGA RLE grey 640x480 | 289,742 | full-screen slide |
| DATA/ODWAR.TGA | TGA RLE grey 640x480 | 225,056 | full-screen slide |
| DATA/SECRET.TGA | TGA RLE grey 640x480 | 214,723 | full-screen slide |
| DATA/_6998.TGA | TGA RLE grey 171x62 | 1,517 | sprite |
| DATA/_8996.TGA | TGA RLE grey 171x62 | 1,517 | sprite |
| DATA/FONTS/*.TGA (47 files: 0-9, A-Z, FONT, CLOSE EQUAL HOMO1 OPEN PLUS POINT QUOTE SHOUT SLASH WHAT) | TGA RLE grey, per-glyph sizes (e.g. A 23x34) | 89,934 total | typographic glyph cut-outs for the big-letter scenes |

## Golden capture (golden.py rewritten, trustworthy)
Corrections to the "Harness caveats" above:
- **The screen IS the arena block at 0x20000000**: DPMI 0800 (phys 0x3f00000) returns the first `aalloc` = 0x20000000 (4 MB), and the presenters write through ES = selector 0x217 whose LDT base is 0x20000000. `emucore.LFB=0x3f00000` is only the *physical* address reported by VBE modeinfo; it is never written. So dumping 0x20000000 was right.
- The earlier filter `EDI in 0x20000000..` could never match: in the presenters **EDI is an offset in ES** (after the copy EDI = 0x4b000 = 640*480). Real present = the instruction after a `rep movs` with `EDI == 0x4b000` (only presenter hit so far: 0x1f09e; the other `rep movs` are struct copies with other EDI). One present per frame, also exactly one int21 AH=0Bh keyboard poll per frame.
- Clock: **present-driven, deterministic**: [0x10efa0] += K (default 7 = 10 fps of 70 Hz ticks) after each present; a stall breaker adds +1 tick per 20000 basic blocks if no present for 3M blocks (never triggered in the first 250 frames). A pure block-counter timer is not used: a frame costs ~468k blocks (= 23 ticks at 20000 blk/tick), so it would tie the grid to emulator instruction counts.
- Music row/order fed at 0x280c0 from xm_times.json at t = ticks/70 (T0 env = offset).
- Palette tracked by own OUT hook on 0x3c8/0x3c9 (index + auto-increment, 6-bit DAC, PNG = value*4); E.PAL is cleared on every 0x3c8 write so partial loads break it. Initial palette (not in state.bin) = grey ramp until the demo writes its own (it rewrites it each frame).
- Output: `golden/f%05d.png` (640x480 RGB from palette), `golden/ticks.json` = [[frame, tick, order, row], ...] (row [0x10f0b4], order [0x10f0b8], read at present), checkpoints `golden/ckpt/ckpt.bin` (E snapshot + host state + segment regs) every 10 s of music; **rerun the same command to resume**: `python3 golden.py golden 7 10` (log `golden/run.log`). FPU stack is not in the snapshot (empty at present points).
- Speed: ~1.6 s/frame alone, ~3.5-4 s/frame in the long run (heavier scenes) => 307 s at K=7 (~3070 frames) takes about 3-4 h.
- Other tools: scratch probes should not live in a dir containing `dis.py` (shadows stdlib).

## Parallel capture caveat (stall breaker)
- Segment workers resume from fast-forward checkpoints. The stall breaker (+1 tick per 20000 blocks after 3M blocks without a present) depends on the block counter, which is not saved in checkpoints, so the first frame after a long no-present stretch (scene loads, e.g. ~34 s of emulation before frame 1200) can differ between a continuous run and a resumed one (frame 1200: ~250k pixels differ; 1201, 1202 identical).
- CORRECTION: `golden/f01200.png` is a stale duplicate of f01199 (main run was stopped there); `golden_b/f01200.png` is the real frame and the port matches it exactly. Use golden_b for 1200.
- (Old rule, wrong: use main run's f01200.) Check the first frame of every other segment (1700, 2150, 2500, 2800) against its neighbours; treat a lone odd first frame as a capture artefact, not a demo feature. Fix idea: save the block counter in checkpoints.

## S2 "do" wire object (frames 424-548, scene fn 0x1f380) - ported, bit-exact
`web/js/scene_do.js` (`drawDo(acc,clk)`, hooked in `scenes_2d.js` as `hooks.s2`); `tools/cmp2d.py 424 548` -> 125/125 frames exact. Second 3D engine (0x24488/0x24334/0x24a00, scene 0x10f2bc), never calls 0x2936c. Object = 4x4x4 lattice of 36 lines x 4 control points; t = F(clk-7*423):
1. bend (0x24a00): twist about x by angle x*a, a = sin(0.0061 t)*0.04 (b, c bends 0)
2. camera: eye = 48*normalize(sin(.0081312t), cos(.006227t), sin(.0073823t)); target = 16*(sin(.003t), cos(.006t), sin(-.005t)); engine.js lookAt with columns 0/1 swapped, rows remapped (x,-z,y)
3. each line = cubic Bezier sampled at i/32 (i<32), float32 stores, into camera space (0x23c30)
4. pass 1 blobs: 32x32 texture (sin(x*pi/32)*sin(y*pi/32))^4*32, 16.16 DDA scale; pixel = dst+tex if <=0x40 else 0x40 (not additive); x=639 / y=479 never drawn
5. pass 2: 31 segments per line, colour 0x20 added mod 256 (same line code as engine.js line())
6. projection: lines sx=invz*x+320, sy=invz*y+240, invz=F(192/z); blobs T(x*192*invz*0.7)+319/+239
Gaps: sin/cos/sqrt in JS doubles (matched on all checked frames, 1-ulp risk elsewhere); entry clock hard-coded 7*423.

## Extension to frames 1200..1699 (S5 end, S6 PALLO, S7 EXE005) - exact
Result (tools/cmp2d.py against the golden PNGs, whole-frame pixel diff; raw index buffers against `re/tools/cap_raw.py` captures of golden_ff checkpoints, 0 differing bytes):
| scene | frames | exact / total | note |
|---|---|---|---|
| S0..S5 | 0..1199 | 1200/1200 | unchanged; S3 786/787 now exact (see below) |
| S5 (TPOLM3) | 1200..1363 | 164/164 | no new code (fade arg 1+row*3.2 at order 13 already covered) |
| S6 PALLO (fn 0x1fb74) | 1364..1668 | 305/305 | raw buffer also exact on 1364..1668 |
| S7 EXE005 (fn 0x1feb4) | 1669..1699 | 31/31 | raw buffer exact on 1669..1749 (also the mode 4 period 1706..1742) |
Frame 1200: `re/golden/f01200.png` is a stale duplicate of f01199 (identical bytes, golden/ticks.json ends at 1199); `re/golden_b/f01200.png` is the emulator output from ckpt_120 and the port matches it exactly, so the "stall-breaker artefact" suspicion for 1200 is wrong: use golden_b for 1200 (cmp2d.py does, nothing special-cased).
- **S3 786/787 fix**: the fade arg is `trunc(1+(row-0x16)*c)` with the *double* constant c = 0x1015a1 = 1.5238095238095237; the old literal 1.5238095238 gave 32 for row 43 where the demo gives 33 (palette confirmed against the emulator DAC). The x87 here effectively works in double precision (1+21*c is 33 after the rounded fmul), so JS doubles are the right model for the 2D side; use the exact data constants, never rounded literals.
- **Shading constant**: 0x10326d (16/pi in 0x41e30) is 0.3183099524062959, NOT 1/pi. With 1/pi one face of PALLO (frame 1625, v = 6.0000054) rounded to shade 6 instead of 5: one sliver triangle + wire edges 1 grey off for 6 frames (trail decay). Fixed in engine.js; all earlier results stay exact (face shades within 1e-5 of an integer are rare, that is why the old probes never saw it).
- **S6 PALLO** (scenes_3d_c.js `pallo`, scenes_2d.js `trail(6,..)`): every iteration `buf = (buf + MIDDLE.tga>>2) >> 1` (0x1fc28, first iteration starts from S5's last buffer, like S4 with kikka1; [0x10f144] = data\middle.tga), then mode 4 (att 32, fx=fy=0.8, g = palloG, bank raw*BANK) and mode 2 (the existing palloWire, fx=fy=0.6) are ADDED into the same buffer. Fade arg: 0 until order 16, then trunc(1+row*3.3684210526315788) (0x101621), loop ends at order 16 row 0x13. Bug fixed on the way: palloWire's buffer is only 640*479 long, adding it for 640*480 indices gave NaN -> 0 on row 479.
- **S7 EXE005** (scenes_3d_c.js `exe`): the buffer is *overwritten* each iteration with slide `[0x10f240 + 4*i]`, i = ((clk-clk0)>>8) mod 11 = cred1..cred8, love, love, love (0x1ff01; clk0 = clock at scene entry = 7*1669); odd (clk-clk0)>>8 -> mode 4, even -> mode 2, scene [0x10f2a8] = EXE005.3DS (copied to web/data/3ds), att 64, fx=fy=0.8, camera = 3DS keyframer track with arg = clk*0.5 (absolute clock), implemented with scenes_3d_b `Scene.layer(arg, overrides)`. Frames 1669..1705 are the first (mode 2, cred1) period; 1706..1742 mode 4 + cred2 (checked on raw buffers up to 1749, no golden PNGs exist past 1699).
- **Palette -6** (0x1ebec, layers.js `Palette.dac`): scale = F(0.6 + 0.6*cos^3(x)), x = F(((clk-clk0)*3.1415 + 402.112)*0.0078125), entries trunc(F(base*scale)) clamped to 63; used by S7 until order 19 row 0x2c, then the usual fade 1+(row-0x2c)*3.0476 (both not reachable in 0..1699 except -6; the fade part is untested). Starts at ~0 (cos(pi)^3 = -1), which is why the first S7 frame is black.
- Scene boundaries (first loop iteration, displayed black): S6 = 1364 (order 13 row 20), S7 = 1669 (order 16 row 19). The black-opening rule START applies to S6/S7 too; S4/S6 still advance their trail buffer on that frame.
- Tools: `re/tools/cap_raw.py CKPT N OUTDIR` dumps raw index buffers + DAC per present from a golden_ff checkpoint (read only); with it any layer can be diffed before the palette (`E.at(addr, fn)` hooks for probes at 0x2936c, 0x41f0a, ...).
- Caveats: only frames <= 1699 have golden PNGs (<= 1749 raw); S7 beyond that (slides cred3.., love, fade at order 19) is ported by the same rules but not verified. A seek into S4/S6 replays the trail from the scene start (<= ~300 frames, ~10 ms each in node).

## Extension to frames 1700..2149 (S7 end, S8 BOM) - exact
Oracle: re/golden_c (complete 1700..2149; its ticks.json is segment-local, order/row there are NOT global: use scenes_2d.pos(k)). `tools/cmp2d.py 1700 2149 re/golden_c`:
| scene | frames | exact / total | note |
|---|---|---|---|
| S0..S6 | 0..1699 | unchanged, all exact (re-run: golden 0..1199, golden_b 1200..1699) | |
| S7 EXE005 | 1700..2047 | 348/348 | no new code: slides cred3..8 + love, mode parity, and the order 19 row 0x2c..63 fade (1+(row-0x2c)*3.0476) were already right |
| S8 BOM (fn 0x200d8) | 2048..2149 | 102/102 | new, see below; 2048 is the black opening frame (golden mean 0) |
- S7 ends at order 20 row 0 (frame 2048); S8 = scene fn 0x200d8 (order 20 row 0 .. loop ends at order 22 row 4, i.e. ~frame 2262, only 2048..2149 is verified).
- S8 per iteration: `0x1dd08(0,0)` grain from noise buffer **A** (S0..S2 use B) with the same rand() LCG, which was not called in S3..S7, so call number = 549 + (k-2048) (noise.js `grainA`); `0x1de34` sprite 6998 at (W-w,0) (as S5); 3D = BOM.3DS ([0x10f290]), camera **"Camera02"** (0x292ac by name; BOM has Camera01 and Camera02, so scenes_3d_b `parseKF(buf, cam)` / `mk(name, att, cam)` now select the keyframer nodes 0xB003/0xB004 by their 0xB010 node name), mode 4, att 64, fx = fy = 0.4, track time = F(clk*0.15) (double 0x101659, absolute clock); added (mod 256) like S3..S5 (web/js/scenes_3d_d.js, hooks.s8).
- S8 palette (LAG 0, same structure as S7): arg 0 (pulse) until order 21 row 0x30, then trunc(1+(row-0x30)*3.2) (0x101669), then at order 22 rows 0..4 trunc(1+(row+16)*3.0476190476190474) (0x101661), i.e. fade out at the end of order 21 and a partial fade-in/hold at 22.0..22.4. The 21.0x30+ and 22.x fades are NOT verified (golden_c stops at frame 2149 = order 20 row 63); the code is read from 0x20226..0x2029d.
- FRAMES = 2150, START[8] = 2048. Not ported (no golden yet): S9.. = 0x202d8, 0x204e0, 0x20730, 0x208f4 (starting after order 22 row 4), and the later mode 2/8 call sites 0x1ffc6.. ; those are the next job once golden_d..f exist.

## Extension to frames 2150..2499 (S8 tail, S9, S10 start) - exact
Oracle: re/golden_d (complete 2150..2499). `tools/cmp2d.py A B DIR` (START table there now has 2260 and 2468); all ranges re-run after the change: golden 0..1199, golden_b 1200..1699, golden_c 1700..2149, golden_d 2150..2499 = 2500/2500 frames, 0 differing pixels. `tools/uitest.mjs` passes (FRAMES = 2500).
| scene | frames | exact / total | note |
|---|---|---|---|
| S8 BOM (0x200d8) tail | 2150..2259 | 110/110 | the unverified fade constants (order 21 row 0x30+: 1+(row-0x30)*3.2; order 22 rows 0..4: 1+(row+16)*3.0476) are right; no code change. S8 ends at order 22 row 4 (gate 0x1e044(22,4)), black opening frame of S9 = 2260 |
| S9 (0x202d8) | 2260..2467 | 208/208 | new |
| S10 (0x204e0) | 2468..2499 | 32/32 | new, only its first 32 frames exist in the golden; 2468 = black opening frame |
- **S9** (order 22.4 .. 24.6, loop ends at gate 0x1e044(24,6)): trail buffer like S4/S6 (`buf = (buf + nowhere.tga>>2) >> 1`, slide = [0x10f148] = data\nowhere.tga, first iteration starts from S8's last buffer) + BOM.3DS, camera "Camera02", **mode 4, att 32** (S8: 64), fx = fy = 0.4, track time clk*0.15 (0x101689), added in place. No grain, no sprite. **scene+0xa4 = 1**: 0x422e8 (0x42a82) then puts the light on the camera EYE instead of the target (S3..S8 have 0 = target); scenes_3d_b `layer(arg, {light: 'eye'})`. Palette (LAG 0): arg 0, order 23 row >= 0x32: trunc(1+(row-0x32)*3.0476190476190474) (0x101691), order 24 rows 0..6: trunc(1+(row+14)*3.0476...).
- **S10** (starts at order 24 row 6; scene fn 0x204e0, slide [0x10f170] = data\nowh2.tga, same trail rule, same BOM/Camera02/att 32/fx fy 0.4/time clk*0.15, a4 = 1): **mode 8**. Mode 8 = mode 4 fill (edge buffer scene+0x68, prefix-sum resolve into the screen) PLUS the triangle outlines of mode 2 (0x592d0 calls 0x5d840 first when [ctx+4]==8), but the lines are added **directly into the 640-pitch screen bitmap**, not into the edge buffer (so they are not prefix-summed; the earlier engine.js mode 8 put them in the edge buffer = garbage stripes). engine.js: `ctx.wc` = separate 640-pitch line buffer, returned as `out.wire`; scenes_3d_e.js s10 adds fill and wire. Palette arg 0 in the verified range (the code at 0x2064e..0x206e3: from order 25 row 0 a8 = (clk - clk_first)*0.002 scales the eye by (1+a8) (0x42aea..0x42b51, light taken BEFORE the scaling), from order 25 row 4 arg = trunc(1+(row-0x1c)*0.9846153846153847), loop ends at order 26 row 5) - NOT ported, nothing to verify against before frame 2500.
- Not ported (no golden): rest of S10, S11 = 0x20730 (scene [0x10f2b4], slide [0x10f128], a4 = 1, camera by 0x292e0 = first camera), S12 = 0x208f4 (call sites 0x207e6/0x209aa mode 2? and 0x20d41 mode 8 in 0x20ca9..), 0x20680. Static reading only; frames 2500+ (golden_e/f) were not touched.
- Files: web/js/scenes_3d_e.js (new), scenes_3d_b.js (light 'eye'), engine.js (mode 8 wire layer), scenes_2d.js (START/LAG/argOf/trail/hooks).

## Extension to frames 2500..3004 (S10 rest, S11, S12 = end of the visual part) - exact
Oracle: re/golden_e (2500..2799) and re/golden_f (2800..3004, capture finished; ticks.json segment-local, use scenes_2d.pos(k)). `tools/cmp2d.py A B DIR`, all ranges re-run: golden 0..1199, golden_b 1200..1699, golden_c 1700..2149, golden_d 2150..2499, golden_e 2500..2799, golden_f 2800..3004 = 3005/3005 frames, 0 differing pixels. `tools/uitest.mjs` (seeks incl. 255/267.2/277.1/279.9/290/300.4 s) passes, cmpshot 0.000% on all. FRAMES = 3005.
| scene | frames | exact / total | note |
|---|---|---|---|
| S10 (0x204e0) | 2468..2670 | 203/203 | eye scale a8 + fade + flash, see below |
| S11 (0x20730) | 2671..2771 | 101/101 | new |
| S12 (0x208f4) | 2772..3004 | 233/233 | new, last scene |
- **Scene starts** follow the same rule as before: first frame with pos(k) >= the exit gate of the previous scene: S10 ends at gate(26,5) -> S11 = 2671, S11 ends at gate(27,4) -> S12 = 2772. (cmp2d START and scenes_2d START updated.)
- **S10 eye scale**: scene+0xa8 is set after the present of an iteration once `order*64+row > 1604.0f` (float 0x44c88000 = 1604, i.e. order 25 row 5; NOT 1600/row 0), clk_first = clock stored in that iteration (= 7*(j+1), j = that iteration), a8 = F((clk - clk_first)*0.002) float32, so the first frame that sees it (2568, pos 25.5) has a8 = 0 and 2569 is the first scaled one. 0x422e8: eye *= (1 + a8) per component (float32 stores), light on the UNSCALED eye (a4 = 1), target not scaled. `Scene.layer(arg, {a8})` in scenes_3d_b.js, `CLK_A8` in scenes_2d.js (derived from pos()).
- **S10 palette**: arg = trunc(1+(row-0x1c)*0.9846153846153847) from order 25 row 4 to order 26 row 5 (0x206b7: gate(25,4)). It is NEGATIVE (-22 at row 4 .. -1 at row 27, then positive 1..35 up to row 63; order 26 rows 0..5 give -26..-22): 0x1eb70 scales by (65-arg)/64 > 1, no clamp, byte store, VGA DAC keeps 6 bits -> `& 63` (layers.js Palette.dac). Two special values occur once each: row 0x13 -> arg -7 = the flash (0x1ecc8): scale = 2.0 because 0x13 is in its row list and the flag is 0 (scenes_2d greyAt: S10 uses scale 2, S2 keeps the replayed flashScale; the old replay used S2's LAG and gave the wrong state here) and row 0x14 -> arg -6 (S7's cos flicker with clk0 = S7 entry clock, already right).
- **S11/S12** (web/js/scenes_3d_f.js): same scene [0x10f2b4] = TPOLM1.3DS (copied to web/data/3ds; one camera Camera01, 0x292e0 = first camera), mode 2 (wire into the 640-pitch buffer, 639x479 window, like S7), att 128 (0x43000000), fx = fy = 0.4, a4 = 1 (light on the eye), track time clk*0.15 (absolute clock, 0x1016d1 / 0x1016e9). Both use the trail rule (buf = (buf + slide>>2) >> 1, first iteration starts from the previous scene's last buffer): S11 slide [0x10f128] = data\creds.tga, S12 [0x10f164] = data\copyrigh.tga. Palette LAG 0: S11 arg 0 until order 27, then trunc(1+row*16) (0x1016d9, rows 0..3); S12 arg 0 until order 29 row 0, then trunc(1+row*2.909090909090909) (0x1016f1) up to the end. S12 ends when gate(29,22) is true (frame 3005 = pos 29.22; the other test gate(1,10) only aborts if the music restarted). The first frame of each scene is black (opening rule; trail advances).
- **End of the demo**: main (0x1d256..) = 0x20de8 (pre-demo slide [0x10f17c] for 0x259 frames, no music yet), then S0..S12 (0x1edb0..0x208f4), then 0x27d64 (shutdown) and the exit text. S12 is the last scene, so the visual part ends at frame 3004; 3005..3071 (music tail up to 307.2 s) has no picture in the original: the web player simply keeps the last (near black, fade arg 62) frame. Nothing is left to port in the effect code.
- Not used by the demo's timeline: functions at 0x20acc (LANDCRUI [0x10f2a0], mode 4, att 32, gate order 7), 0x20c8c (BOM mode 8), 0x20e7c are NOT in the main call list (0x1d265..0x1d2a1): dead/leftover test scenes, so LANDCRUI.3DS / TPOLM2.3DS were not needed (TPOLM1 only).
- Not ported / caveats: nothing visual. S11/S12 wire values rely on the same float32 clip/line code as S7, exact on all 334 frames. 1-ulp risks from JS doubles in sin/cos remain theoretical.

## PALLO pulse speed (real-time correction)
* PALLO (S6, frames 1364..1668, e.g. 2:40): the vertex-pulse phase g is PER FRAME (+0.18 per render call, 2 per frame) while the camera is clock-driven. The original has a free loop (no vsync, no frame cap, only the 70 Hz MIDAS clock), so the pulse runs at a machine-dependent speed; the 10 fps golden grid makes it 3.6 g/s, a real run (assumed `ORIG_FPS = 35` in `scenes_3d.js`, unmeasured) about 3.5x faster. The port now computes g from the clock: g = anchor + 0.36 x frames, frames = (clk - 9548)/70 x ORIG_FPS. Frame 1364 still matches the golden; later S6 frames (1365..1668) deliberately do NOT (pulse phase off by up to ~150 rad of sin argument at 1600, so the sphere shape differs; the camera, palette and trail are unchanged). Trail decay (0.5 per frame) is still replayed per 10 fps frame.

## DAC wrap vs saturation (S10)

DAC saturation (SATURATE_DAC in layers.js, default true): the original byte-stores trunc(base*scale) and OUTs it to 0x3c9 unclamped (0x1eb70: fistp, mov al,[esp+4], out via 0x28706), so values >63 are sent as-is (up to 74 here); a real VGA DAC and DOSBox keep 6 bits (wrap, flashes black) and our golden harness (re/golden.py `_out`, `val&63`) masks too, so the emulator golden has the wrap baked in. User report (4:18) says the original shows white, so the port saturates at 63 instead (set SATURATE_DAC=false for the bit-exact emulator wrap). Affected: only arg<0 frames other than -6/-7 whose pre-mask value exceeds 63, 14 frames: k=2567..2569, 2582..2590 (258.2..259.0 s, args -13..-8, max 69..74), 2670, 2671. Those frames now differ from the emulator golden BY DESIGN (the dark-wrapped grey levels become 63 = white); all other frames, including the -6 flicker (already clamped by 0x1ebec) and the -7 flash (clamped by 0x1ecc8), are unchanged and exact. Which behaviour real hardware had is not settled by the evidence: hardware wraps, the user's memory says white.
