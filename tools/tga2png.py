#!/usr/bin/env python3
"""tga2png.py [OUTDIR=web/data]: decode every DATA/**/*.TGA like the demo (0x1e1c0 -> 0x1e4fc).
All 80 files are type 11 (RLE), 8 bpp, no palette, origin bottom-left. Packet: b>=0x80 -> repeat next byte (b&0x7f)+1 times, else (b+1) literal bytes.
The demo flips rows (bottom-up -> top-down) and stores pixel>>2 (6-bit VGA index); PNGs keep the raw 0..255 values (top-down). Use decode(path, shift=True) for the demo's buffer."""
import struct, sys, glob, os
from PIL import Image
import numpy as np
def decode(path, shift=False):
    d = open(path, 'rb').read()
    idl, cm, t, _, _, _, _, _, w, h, bpp, desc = struct.unpack('<BBBHHBHHHHBB', d[:18])
    assert (t, cm, bpp) == (11, 0, 8), (path, t, cm, bpp)
    p = 18 + idl; out = bytearray()
    while len(out) < w * h:
        b = d[p]; p += 1
        if b & 0x80: out += d[p:p+1] * ((b & 0x7f) + 1); p += 1
        else: out += d[p:p+b+1]; p += b + 1
    a = np.frombuffer(bytes(out[:w*h]), np.uint8).reshape(h, w)[::-1]
    return (a >> 2) if shift else a
if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    od = sys.argv[1] if len(sys.argv) > 1 else root + '/web/data'
    for f in sorted(glob.glob(root + '/DATA/**/*.TGA', recursive=True)):
        rel = os.path.relpath(f, root + '/DATA')[:-4].lower().replace(os.sep, '/')
        o = f'{od}/tex/{rel}.png'; os.makedirs(os.path.dirname(o), exist_ok=True)
        Image.fromarray(decode(f), 'L').save(o, optimize=True)
        print(o)
