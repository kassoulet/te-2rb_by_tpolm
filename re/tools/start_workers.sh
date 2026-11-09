#!/bin/bash
# waits for fast-forward ckpts in golden_ff/ckpt and starts one capture worker per segment start
cd "$(dirname "$0")/.."
STARTS=(120 170 215 250 280); L=(b c d e f)
for i in "${!STARTS[@]}"; do
  s=${STARTS[$i]}; n=${STARTS[$((i+1))]:-307.2}; d=golden_${L[$i]}
  while [ ! -s golden_ff/ckpt/ckpt_$s.bin ]; do sleep 5; done; sleep 3
  mkdir -p $d/ckpt; cp golden_ff/ckpt/ckpt_$s.bin $d/ckpt/ckpt.bin
  SKIPFIRST=1 MAXT=$n nohup python3 golden.py $d 7 10 > $d/run.log 2>&1 & echo "$d start=$s end=$n pid=$!" | tee -a golden_ff/workers.txt
done
