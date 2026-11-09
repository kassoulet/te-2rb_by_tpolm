#!/usr/bin/env python3
"""golden.py - reference frames of the ORIGINAL demo (Unicorn), resumable.
 python3 golden.py OUTDIR [K=7] [CKPT_SECS=10]      env: T0 (music offset s), STALL (blocks, default 3e6), MAXT (stop at music s, default 307.2)
Method (see NOTES.md 'Golden capture'):
 - screen = the 4 MB arena block returned by DPMI 0800 (ARENA 0x20000000); the presenters copy to ES:EDI where ES is a selector based on it
   (EDI is an OFFSET, not 0x3f00000-ish). A real present = `rep movs` whose EDI ends at 0x4b000 (=640*480, full frame). Other rep movs are struct copies.
 - clock [0x10efa0] (70 Hz) += K per present (deterministic, independent of instruction count); if no present for STALL blocks
   (busy wait / fade) it falls back to +1 per BPT=20000 blocks so it can never hang.
 - music row/order fed from xm_times.json at virtual time ticks/70 through the 0x280c0 hook.
 - frame = 640x480x8 dump + palette tracked from ports 0x3c8/0x3c9 (6-bit DAC *4), tagged with tick, order, row.
 - OUTDIR/ckpt/ckpt.bin (E snapshot + host state) every CKPT_SECS of music; rerunning the same command resumes from it."""
import emucore as E,struct,sys,os,json,bisect,pickle
import numpy as np
from PIL import Image
from unicorn import *
from unicorn.x86_const import *
out=sys.argv[1]; K=int(sys.argv[2]) if len(sys.argv)>2 else 7; CK=float(sys.argv[3]) if len(sys.argv)>3 else 10
STALL=int(float(os.environ.get('STALL','3e6'))); BPT=20000; MAXT=float(os.environ.get('MAXT','307.2')); T0=float(os.environ.get('T0','0'))
FF=os.environ.get('FF')=='1'   # fast-forward: no PNG, no per-block stall hook (aborts if a stall would have occurred); CKKEEP=1 keeps ckpt_<sec>.bin copies
os.makedirs(out+'/ckpt',exist_ok=True); CKP=out+'/ckpt/ckpt.bin'
CLK=0x10efa0; SEGS=['CS','DS','ES','SS','FS','GS']
S=dict(n=0,ticks=0,tt=[],pal=[(i,i,i) for i in range(256)],pi=0,pc=0,nextck=CK)   # host state (pickled in checkpoints)
if os.path.exists(CKP):
    st=E.load_snapshot(CKP); ex=st['extra']; S.update(ex['S'])
    for r,v in ex['seg'].items(): E.mu.reg_write(E.R(r),v)
    E.mu.reg_write(E.R('EIP'),st['regs']['EIP']); print('resumed at frame',S['n'],'tick',S['ticks'])
else:
    st=E.load_snapshot(E.HERE+'/state.bin'); E.mu.reg_write(E.R('EIP'),st['regs']['EIP'])
XM=json.load(open(E.HERE+'/xm_times.json'))['rows']; XT=[r[2] for r in XM]
def rd(a): return struct.unpack('<I',bytes(E.mu.mem_read(a,4)))[0]
def mt(): return T0+S['ticks']/70.0
def musicpos():
    r=XM[max(0,bisect.bisect_right(XT,mt())-1)]
    E.mu.mem_write(0x121d00,struct.pack('<I',r[1])); E.mu.mem_write(0x121d04,struct.pack('<I',r[0]))
    esp=E.ireg('ESP'); ret=rd(esp); E.w('ESP',esp+4); E.mu.reg_write(E.R('EIP'),ret)
E.mu.hook_add(UC_HOOK_CODE,lambda *a:musicpos(),begin=0x280c0,end=0x280c0)
def adv(d): S['ticks']+=d; E.mu.mem_write(CLK,struct.pack('<I',(rd(CLK)+d)&0xffffffff))
bc=[0]; last=[0]
def tick(uc,a,sz,_):
    bc[0]+=1
    if bc[0]-last[0]>STALL and bc[0]%BPT==0: adv(1)
if not FF: E.mu.hook_add(UC_HOOK_BLOCK,tick)
# palette: own tracking by index (E.PAL is cleared on every 0x3c8 write and breaks on partial loads)
def _out(uc,port,size,val,_):
    if port==0x3c8: S['pi']=val&255; S['pc']=0
    elif port==0x3c9:
        p=list(S['pal'][S['pi']]); p[S['pc']]=val&63; S['pal'][S['pi']]=tuple(p); S['pc']+=1
        if S['pc']==3: S['pc']=0; S['pi']=(S['pi']+1)&255
E.mu.hook_add(UC_HOOK_INSN,_out,None,1,0,UC_X86_INS_OUT)
def checkpoint():
    E.save_snapshot(CKP+'.tmp',{'S':S,'seg':{r:E.ireg(r) for r in SEGS}}); os.replace(CKP+'.tmp',CKP)
    if os.environ.get('CKKEEP')=='1': import shutil; shutil.copy(CKP,CKP.replace('.bin','_%d.bin'%round(mt())))
SKIP1=[os.environ.get('SKIPFIRST')=='1' and os.path.exists(CKP)]   # resume point is the instruction after the present: its hook would fire again and dump a duplicate frame
def present(uc,a,sz,_):
    if SKIP1[0]: SKIP1[0]=False; return
    if E.ireg('EDI')!=640*480: return          # struct copy, not a full-frame present
    base=0x20000000   # ES base checked at probe time (selector based on the DPMI 0800 block)
    fb=np.frombuffer(bytes(E.mu.mem_read(base,640*480)),dtype=np.uint8).reshape(480,640)
    pal=np.array(S['pal'],dtype=np.uint8)*4
    if not FF: Image.fromarray(pal[fb]).save('%s/f%05d.png'%(out,S['n']))
    S['tt'].append((S['n'],S['ticks'],rd(0x10f0b8),rd(0x10f0b4)))
    S['n']+=1; last[0]=bc[0]; adv(K)
    if S['n']%50==0: print(S['n'],'tick',S['ticks'],'t=%.1f'%mt(),'order',S['tt'][-1][2],'row',S['tt'][-1][3],flush=True)
    if mt()>=S['nextck']: S['nextck']+=CK; json.dump(S['tt'],open(out+'/ticks.json','w')); checkpoint()
    if mt()>=MAXT: uc.emu_stop()
import re
for l in open(E.HERE+'/code.dis'):
    m=re.match(r'([0-9a-f]+):\trep movs DWORD PTR es',l)
    if m: a=int(m.group(1),16)+2; E.mu.hook_add(UC_HOOK_CODE,present,begin=a,end=a)
E.run(E.ireg('EIP'),int(1e13))
json.dump(S['tt'],open(out+'/ticks.json','w'))
print('frames',S['n'],'ticks',S['ticks'],'eip',hex(E.ireg('EIP')),'ints',E.cnt.most_common(6))
