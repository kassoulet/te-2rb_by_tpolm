"""cap_raw.py CKPT NFRAMES OUTDIR : resume a golden_ff checkpoint (read only) and dump, per present, the RAW 640x480 index buffer + the 256x3 DAC palette
+ [ticks, order, row] to OUTDIR/bNNNNN.npz (fb, pal, tk). The raw buffer is the exact oracle for web/js (before the palette); no stall breaker, K=7.
Example: python3 cap_raw.py ../golden_ff/ckpt/ckpt_160.bin 51 /tmp/s160   (frames 1600..1650). Hooks (E.at) can be added for probes at 0x2936c / 0x41f0a."""
from unicorn.x86_const import *
import sys,os; sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
import emucore as E,struct,json,bisect,re,numpy as np
from unicorn import *
CK=sys.argv[1]; NF=int(sys.argv[2]); 
st=E.load_snapshot(CK); S=st['extra']['S']
for r,v in st['extra']['seg'].items(): E.mu.reg_write(E.R(r),v)
E.mu.reg_write(E.R('EIP'),st['regs']['EIP'])
print('resume n',S['n'],'ticks',S['ticks'])
XM=json.load(open(E.HERE+'/xm_times.json'))['rows']; XT=[r[2] for r in XM]
CLK=0x10efa0
def rd(a): return struct.unpack('<I',bytes(E.mu.mem_read(a,4)))[0]
def musicpos():
    r=XM[max(0,bisect.bisect_right(XT,S['ticks']/70.0)-1)]
    E.mu.mem_write(0x121d00,struct.pack('<I',r[1])); E.mu.mem_write(0x121d04,struct.pack('<I',r[0]))
    esp=E.ireg('ESP'); ret=rd(esp); E.w('ESP',esp+4); E.mu.reg_write(E.R('EIP'),ret)
E.mu.hook_add(UC_HOOK_CODE,lambda *a:musicpos(),begin=0x280c0,end=0x280c0)
def adv(d): S['ticks']+=d; E.mu.mem_write(CLK,struct.pack('<I',(rd(CLK)+d)&0xffffffff))
import os
OUT=sys.argv[3]; os.makedirs(OUT,exist_ok=True)
pal=[list(p) for p in S['pal']]; pi=[S['pi']]; pc=[S['pc']]
def _out(uc,port,size,val,_):
    if port==0x3c8: pi[0]=val&255; pc[0]=0
    elif port==0x3c9:
        pal[pi[0]][pc[0]]=val&63; pc[0]+=1
        if pc[0]==3: pc[0]=0; pi[0]=(pi[0]+1)&255
E.mu.hook_add(UC_HOOK_INSN,_out,None,1,0,UC_X86_INS_OUT)
def adv(d): S['ticks']+=d; E.mu.mem_write(CLK,struct.pack('<I',(rd(CLK)+d)&0xffffffff))
skip=[True]; start_n=S['n']
def present(uc,a,sz,_):
    if skip[0]: skip[0]=False; return
    if E.ireg('EDI')!=640*480: return
    fb=bytes(E.mu.mem_read(0x20000000,640*480))
    np.savez_compressed('%s/b%05d.npz'%(OUT,S['n']),fb=np.frombuffer(fb,np.uint8),pal=np.array(pal,np.uint8),tk=np.array([S['ticks'],rd(0x10f0b8),rd(0x10f0b4)]))
    S['n']+=1; adv(7)
    if S['n']>=start_n+NF: uc.emu_stop()
for l in open(E.HERE+'/code.dis'):
    m=re.match(r'([0-9a-f]+):\trep movs DWORD PTR es',l)
    if m: a=int(m.group(1),16)+2; E.mu.hook_add(UC_HOOK_CODE,present,begin=a,end=a)
E.run(E.ireg('EIP'),int(1e13))
