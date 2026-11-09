#!/usr/bin/env python3
"""cmp2d.py FIRST LAST [GOLDEN_DIR] : web/js/scenes_2d.js frames (node tools/dump2d.mjs) vs GOLDEN_DIR/fNNNNN.png (default re/golden, read only).
Per frame: % differing pixels (whole frame), % differing inside the TV window 189..461 x 55..354, mean |err|, and 'g<our' = % of pixels where the golden is
DARKER than ours (the missing 3D layers only ever add light, so for S2..S5 this must be 0). Then a summary per scene (S0 0-119, S1 121-422, S2 424-548,
S3 550-819, S4 821-1079, S5 1081-). Opening frames 120/423/549/820/1080 are black in the demo.
GOLDEN_DIR may be a 'golden2d' oracle (emulator run with the 3D render 0x2936c stubbed, see re/NOTES.md) - then S3/S4/S5 must be exact."""
import subprocess, sys, os
import numpy as np
from PIL import Image
a, b = int(sys.argv[1]), int(sys.argv[2])
here = os.path.dirname(os.path.abspath(__file__))
gd = sys.argv[3] if len(sys.argv) > 3 else f'{here}/../re/golden'
raw = subprocess.run(['node', os.path.join(here, 'dump2d.mjs'), str(a), str(b)], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, 480, 640)
START = [0, 120, 423, 549, 820, 1080, 1364, 1669, 2048, 2260, 2468, 2671, 2772, 10**9]
per = {}
for i, n in enumerate(range(a, b + 1)):
    f = f'{gd}/f{n:05d}.png'
    g = np.array(Image.open(f).convert('L'))
    d = fr[i] != g; w = d[55:355, 189:462]
    print(f'f{n:05d} diff {100*d.mean():6.2f}%  tv-window {100*w.mean():6.2f}%  mean|err| {np.abs(fr[i].astype(int)-g).mean():6.2f}  g<our {100*(g<fr[i]).mean():5.2f}%')
    s = max(j for j in range(13) if n >= START[j]); per.setdefault(s, []).append(100 * d.mean())
print('summary (mean % differing, exact frames / frames):')
for s, v in sorted(per.items()): print(f'  S{s}: {np.mean(v):6.2f}%  exact {sum(x == 0 for x in v)}/{len(v)}')
