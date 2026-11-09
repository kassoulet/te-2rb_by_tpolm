#!/bin/bash
# merge golden/ (main) + golden_b..f (parallel segments) into golden_all/ : symlinked frames + merged ticks.json. Main wins on overlap.
cd "$(dirname "$0")/.."; rm -rf golden_all; mkdir golden_all
for d in golden_[b-f] golden; do for f in $d/f*.png; do [ -e golden_all/$(basename $f) ] || ln -s ../$f golden_all/$(basename $f); done; done
python3 - <<'P'
import json,glob
m={}
for d in sorted(glob.glob('golden_[b-f]'))+['golden']:
    try:
        for r in json.load(open(d+'/ticks.json')): m[r[0]]=r
    except Exception as e: print('skip',d,e)
json.dump([m[k] for k in sorted(m)],open('golden_all/ticks.json','w')); print(len(m),'frames; missing:',[k for k in range(max(m)+1) if k not in m][:10])
P
