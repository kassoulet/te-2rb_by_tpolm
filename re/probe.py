import emucore as E,struct,sys
from unicorn import *
st=E.load_snapshot(E.HERE+'/state.bin'); E.mu.reg_write(E.R('EIP'),st['regs']['EIP'])
W=int(sys.argv[1],0); seen=[]
def wh(uc,acc,addr,size,val,_):
    seen.append((E.ireg('EIP'),val))
E.mu.hook_add(UC_HOOK_MEM_WRITE,wh,begin=W,end=W+3)
E.run(E.ireg('EIP'),int(float(sys.argv[2])*1e6))
print('eip',hex(E.ireg('EIP')),'writes',len(seen)); 
import collections; print(collections.Counter(hex(a) for a,_ in seen).most_common(5)); print([v for _,v in seen[:10]],[v for _,v in seen[-3:]])
print('ints',E.cnt.most_common(8))
