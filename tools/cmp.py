#!/usr/bin/env python3
"""cmp.py FIRST LAST: our TV-scene frames (node tools/dump3d.mjs) vs re/golden/fNNNNN.png (read only).
Prints % differing pixels (whole frame, 3D window 189..461 x 55..354) and mean abs error. The noise field / digits / fade are approximate,
so whole-frame equality is NOT expected; the 3D layer itself is verified exactly against emulator dumps (see engine.js header)."""
import subprocess, sys, os
import numpy as np
from PIL import Image
a, b = int(sys.argv[1]), int(sys.argv[2])
here = os.path.dirname(os.path.abspath(__file__))
raw = subprocess.run(['node', os.path.join(here, 'dump3d.mjs'), str(a), str(b)], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, 480, 640)
for i, n in enumerate(range(a, b + 1)):
    g = np.array(Image.open(f'{here}/../re/golden/f{n:05d}.png').convert('L'))
    d = fr[i] != g
    w = d[55:355, 189:462]
    print(f'f{n:05d} diff {100*d.mean():5.1f}%  window {100*w.mean():5.1f}%  mean|err| {np.abs(fr[i].astype(int)-g).mean():5.1f}')
