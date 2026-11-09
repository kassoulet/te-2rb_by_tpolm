#!/usr/bin/env python3
"""boot.py: boot the unpacked DEMO.EXE (mem0.bin, entry 0x2819c) in Unicorn and report where it stops / which ints are unhandled."""
import emucore as E,struct,sys
from unicorn import *
from unicorn.x86_const import *
E.mu.reg_write(E.R('ESP'),0x3f0000)
E.run(0x2819c,int(float(sys.argv[1])*1e6) if len(sys.argv)>1 else 300000000)
print('stopped eip',hex(E.ireg('EIP')),'steps done; ints',E.cnt.most_common(12))
print(E.TR[-6:]); print('files',{k:(len(v[0]),v[1]) for k,v in E.files.items()})
import numpy as np
from PIL import Image
fb=np.frombuffer(bytes(E.mu.mem_read(0x20000000,640*480)),dtype=np.uint8).reshape(480,640)
pal=np.array(E.PAL[:768],dtype=np.uint8).reshape(-1,3)*4 if len(E.PAL)>=768 else np.stack([np.arange(256)]*3,1).astype(np.uint8)
Image.fromarray(pal[fb]).save(E.HERE+'/boot_fb.png'); print('pal entries',len(E.PAL)//3,'fb nonzero',int((fb>0).sum()))
E.save_snapshot(E.HERE+'/state.bin'); print('saved state.bin')
