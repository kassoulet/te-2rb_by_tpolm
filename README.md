# TE-2RB (TPOLM, The Gathering 1998 party version) - JavaScript port + reverse engineering

**STATUS: visual part complete.** All 3005 frames of the picture (frames 0..3004, scenes S0..S12, music 0:00 .. 5:00) are ported and bit-exact against the original run in an emulator (3005/3005, 0 differing pixels).
Frames 3005..3071 (the music tail up to 307.2 s) have no picture in the original; the player keeps showing the last frame (fade arg 62, near black).

## Run
```
cd web && python3 -m http.server 8000      # http://localhost:8000/  (click / Space to start: sound needs a user gesture)
```
Player: the 640x480 8-bit picture is shown in a **4:3** box (the original mode is VESA 640x480x8, the display box is 4:3; keep that aspect), music `TE-2RX.XM` through libopenmpt (chiptune3, `web/vendor`),
play/pause, a **seek bar that works anywhere**, -10 s / +10 s, fullscreen. Keys: Space, Left/Right (5 s, Shift 10 s), Home/End, F.
Seeking works because the picture is a function of the music position (see `WRITEUP-effects.md`, "Why seeking works"). The picture is rendered on the 10 fps grid of the reference capture (frame k = music time k/10 s = demo clock 7k ticks of 70 Hz): `k = round(t*10)`, clamped to frame 3004.

## Tests
```
python3 tools/cmp2d.py FIRST LAST [GOLDEN_DIR]   # port frames (node tools/dump2d.mjs) vs emulator PNGs: whole-frame pixel diff per frame + per-scene summary
python3 tools/cmp2d.py 0 1199                    # re/golden     (default dir)
python3 tools/cmp2d.py 1200 1699 re/golden_b
python3 tools/cmp2d.py 1700 2149 re/golden_c
python3 tools/cmp2d.py 2150 2499 re/golden_d
python3 tools/cmp2d.py 2500 2799 re/golden_e
python3 tools/cmp2d.py 2800 3004 re/golden_f
node tools/uitest.mjs                            # play/pause/seek smoke test (headless google-chrome via CDP; serves web/ itself)
```
`cmp2d.py` needs numpy + Pillow + node. Golden PNGs are read-only reference data; do not regenerate them casually (the capture takes hours, see below).
`tools/cmp.py` / `dump3d.mjs` are the first, TV-scene-only comparison (superseded by `cmp2d.py`).

## What is here
* `DEMO.EXE TE-2RX.XM *.3DS DATA/ FILE_ID.DIZ INFOFILE` - originals (untouched).
* `re/` reverse engineering: `unpack_pmodew.py` (PMODE/W 1.33 stub run under Unicorn -> `mem0.bin`, image at the entry 0x2819c), `emucore.py` (DOS file backend, DPMI, VBE 640x480x8, VGA DAC capture),
  `boot.py` (boots the original, `state.bin`), `golden.py` (virtual 70 Hz clock, K=7 ticks per present, music row/order fed at 0x280c0 from `xm_times.json`, checkpoints), `re/tools/cap_raw.py` (raw index buffers + DAC from a checkpoint, the oracle *before* the palette),
  `probe.py`/`dbg*.py` scratch probes, `code.bin`/`code.dis`/`data.bin` (unpacked image, linear disassembly), `NOTES.md` (long-form log), `notes_3d.md` (static analysis of the renderer), `notes_asm_candidates.md`.
  `re/golden` (0..1199), `golden_b` (1200..1699), `golden_c` (1700..2149), `golden_d` (2150..2499), `golden_e` (2500..2799), `golden_f` (2800..3004) = frames of the original, `golden_ff` = fast-forward checkpoints; `re/tools/start_workers.sh`, `merge_golden.sh`.
* `tools/` `tga2png.py` (TGA -> PNG), `parse3ds.py`, `export3ds.py` (assets to `web/data`), `cmp2d.py`, `dump2d.mjs`, `cmp.py`, `dump3d.mjs`, `uitest.mjs`.
* `web/` the player (ES modules, no build): `js/scenes_2d.js` (compositor, palette lag, scene table), `layers.js` (textures, sprite blit, digits, palette chain), `noise.js` (grain), `engine.js` (3D renderer),
  `scenes_3d.js` (TEEVEE, PALLO wire), `scenes_3d_b.js` (keyframer, S3/S4/S5), `scenes_3d_c.js` (PALLO solid, EXE005), `scenes_3d_d.js` (BOM, S8), `scenes_3d_e.js` (BOM again: S9 mode 4, S10 mode 8), `scenes_3d_f.js` (TPOLM1 wire: S11, S12), `scene_do.js` (S2 lattice), `player.js`; `data/tex` (slides/fonts as PNG), `data/mesh`, `data/3ds`, `data/xmrows.json` (order,row -> seconds), `about.html`.
* `WRITEUP-asm.md` (asm snippets: edge-delta fill, line drawer, clipper, acos shade, truncating cast, scene gate, TGA loader), `WRITEUP-effects.md` (scenes S0..S12).

## Faithful vs approximated (honest)
Method of the check: the port renders the 640x480 byte buffer and the 6-bit palette; the display grey (4 x DAC value) is compared pixel by pixel with the PNGs dumped from the original running in Unicorn (`cmp2d.py`),
and for some scenes also the raw index buffer before the palette (`re/tools/cap_raw.py`).

**Bit-exact (0 differing pixels over the whole 640x480 frame), frames 0..3004 = 3005/3005, scenes S0..S12:**

| scene | frames | what | oracle |
|---|---|---|---|
| S0 | 0..119 | grain + apup slides + fade | `re/golden` |
| S1 | 121..422 | grain + alku slide + TEEVEE 3D + random digits | `re/golden` |
| S2 | 424..548 | grain + donot slide + "do" wire lattice (second 3D engine) | `re/golden` |
| S3 | 550..819 | IHAVITU | `re/golden` |
| S4 | 821..1079 | LAS + trail | `re/golden` |
| S5 | 1081..1363 | TPOLM3 | `re/golden`, `golden_b` |
| S6 | 1364..1668 | PALLO solid + wire + trail | `golden_b` |
| S7 | 1669..2047 | EXE005 + credits slides + palette flicker | `golden_b` (to 1699), `golden_c` |
| S8 | 2048..2259 | BOM + grain A | `golden_c`, `golden_d` |
| S9 | 2260..2467 | nowhere trail + BOM (mode 4, light on the eye) | `golden_d` |
| S10 | 2468..2670 | nowh2 trail + BOM mode 8 (fill + outline), eye scale a8, negative fade arg, flash | `golden_d`, `golden_e` |
| S11 | 2671..2771 | creds trail + TPOLM1 wire | `golden_e` |
| S12 | 2772..3004 | copyrigh trail + TPOLM1 wire, final fade | `golden_e`, `golden_f` |

The scene opening frames 120, 423, 549, 820, 1080, 1364, 1669, 2048, 2260, 2468, 2671, 2772 are black in the demo and in the port (for the trail scenes the buffer still advances on that frame).
Exact counts recorded in `re/NOTES.md`: S0..S5 1200/1200, S5 end 164/164, S6 305/305, S7 31/31 then 348/348, S8 102/102 then 110/110, S9 208/208, S10 32/32 then 203/203, S11 101/101, S12 233/233;
after the last change every range was re-run: 3005/3005 and the headless player test (seeks included) passes. These runs were not repeated for this README.

**What is not exact / not tested (honest list)**
* `sin`/`cos`/`sqrt`/`atan` are the JS double functions, not the x87 instructions, and the renderer keeps x87 intermediates in JS doubles, rounding to float32 (`Math.fround`) where the original stores. No difference was ever seen on the 3005 checked frames, but a 1-ulp difference elsewhere (other clock values, i.e. a different run of the original) cannot be excluded.
* The camera, the paths and every clock-derived constant are verified **only on the golden run** (virtual clock 7 ticks per frame, music position from `xm_times.json`). A real run of the original has a free clock and would show other intermediate positions; the port is a function of the 10 fps grid only.
* Frames 3005..3071: no picture in the original (the demo shuts down after S12); the player holds frame 3004 (fade arg 62 = 3/64 of the white ramp, near black, not exact black).
* Not ported: three functions that the main call list never reaches (0x20acc LANDCRUI mode 4, 0x20c8c BOM mode 8, 0x20e7c; leftover test scenes, hence LANDCRUI.3DS and TPOLM2.3DS are unused) and the pre-demo slide 0x20de8 (slide [0x10f17c] shown for 0x259 frames before the music starts; no music position, so not in the web timeline).
* Audio: the music is `TE-2RX.XM` played by libopenmpt, not the original MIDAS mixer. It was only checked as "the original's music-position context runs" (the gate order/row feed), never compared sample by sample.
* Seek cost: a frame of a trail scene depends on the previous one. A seek replays from the scene start, and the first averaging starts from the previous scene's last buffer (recursively: S10..S12 chain back to S9). In node (this machine, cold, one frame including start-up): about 1.0 s for the end of S6, about 1.7 s for the last frame of S12 (the longest chain, S9..S12, 745 frames). Not measured in a browser.
* Pacing: the port draws the 10 fps grid of the capture; the original runs a free loop (the clock is a 70 Hz timer and the picture is a function of it), so it is smoother on a real machine.
* `web/js/scenes.js` still contains a `teevee` scene (old approximate TV-only version, shadowed by the 2D compositor).

**Data taken from the emulator instead of derived**
* `SEED_PRE0 = 0x6e229d77` in `noise.js`: the `rand()` state before frame 0's grain call (state after both noise generators plus 4546 calls of other start-up code). The generators and the per-frame use of `rand()` are ported; only this start state is a measured constant.
* Anchors fitted on emulator probes: the TV clock origin `T0 = 847`, the PALLO vertex-pulse phase `g = 2521.349365234375` at frame 1364 (clock 9548), the S2 entry clock `7*423`.
* The "0 differing bytes" statements of the 3D layers rest on probes of the original at 0x2936c (edge buffer) for S3/S4/S5, plus whole-frame comparisons everywhere.

**Facts that were wrong at first (kept because they are the traps)**
* The shade constant at 0x10326d is 0.3183099524062959, not 1/pi (PALLO frame 1625).
* Mode 8 = mode 4 fill plus the mode-2 outline, the outline being added straight into the 640-pitch screen and not prefix-summed.
* S10 eye scale starts when `order*64+row > 1604.0f` (order 25 row 5), not at order 25 row 0; a8 = float32((clk - clk_first) * 0.002), the first frame that sees it has a8 = 0.
* S10 fade arg is negative for most of the scene: `1+(row-0x1c)*0.9846153846153847` gives -22 at order 25 row 4; the DAC keeps 6 bits so the palette is stored `& 63`; row 0x13 gives arg -7 (flash, scale 2) and row 0x14 arg -6 (flicker).

## Regenerating the golden frames (only if you really need to)
Needs Python + Unicorn + numpy + Pillow; run in `re/`. `python3 golden.py OUTDIR [K=7] [CKPT_SECS=10]` boots the unpacked original, steps the virtual clock by K ticks per present and writes `OUTDIR/fNNNNN.png`, `ticks.json` (order/row per frame; segment-local in the `golden_b..f` runs, use `scenes_2d.pos(k)`) and a checkpoint in `OUTDIR/ckpt/ckpt.bin` every CKPT_SECS of music; running the same command again resumes.
Env options: `FF=1` fast-forward (no PNG, no stall hook), `CKKEEP=1` keep `ckpt_<sec>.bin` copies, `SKIPFIRST=1` do not dump the frame at the resume point (it would be a duplicate), `MAXT` stop at music second, `T0` music offset, `STALL` blocks before the stall breaker.
Speed: about 1.6 s/frame alone, about 3.5 s/frame in the long run, so the whole demo is 3-4 hours on one core. The way it was done: one `FF=1 CKKEEP=1` run drops checkpoints at 120/170/215/250/280 s, `re/tools/start_workers.sh` starts one worker per segment (`golden_b..f`, `SKIPFIRST=1 MAXT=<next start>`) in parallel, `re/tools/merge_golden.sh` symlinks everything into `golden_all/`.
Caveat: the stall breaker depends on a block counter that checkpoints do not save, so the first frame after a long no-present stretch can differ between a continuous run and a resumed one; check the first frame of every segment against its neighbours.

## Later: WebGL rework
Idea (not started): the engine is flat-shaded, additive, without textures or z-buffer, so it maps well to a WebGL pass (additive blending, resolution independent). The faithful 640x480 JS port stays as the reference.
