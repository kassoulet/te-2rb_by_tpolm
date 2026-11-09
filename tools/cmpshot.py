#!/usr/bin/env python3
"""cmpshot.py SHOTS_DIR : sK.raw (canvas grey, 640x480) from uitest.mjs vs re/golden*/fKKKKK.png; prints % differing pixels."""
import sys, os, glob
import numpy as np
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__)); bad = 0
for f in sorted(glob.glob(sys.argv[1] + '/s*.raw'), key=lambda f: int(os.path.basename(f)[1:-4])):
    k = int(os.path.basename(f)[1:-4])
    d = next((f'{here}/../re/{g}' for g, a, b in (('golden', 0, 1199), ('golden_b', 1200, 1699), ('golden_c', 1700, 2149), ('golden_d', 2150, 2499), ('golden_e', 2500, 2799), ('golden_f', 2800, 3004)) if a <= k <= b), None)
    p = f'{d}/f{k:05d}.png' if d else None
    if not p or not os.path.exists(p): print(f'k={k}: no golden'); continue
    x = np.frombuffer(open(f, 'rb').read(), np.uint8).reshape(480, 640); g = np.array(Image.open(p).convert('L'))
    n = 100 * (x != g).mean(); bad += n > 0; print(f'k={k:5d} {os.path.basename(d)}: {n:.3f}% differing')
sys.exit(1 if bad else 0)
