# Asm optimisation candidates (tpolm2rb)

Addresses refer to code.dis. Excerpts are paraphrased from the disassembly; re-check against code.dis before quoting.

## 1. Fill without a fill loop: edge deltas + prefix sum (0x5e010, 0x29784)
Instead of filling each scanline span, the triangle rasteriser writes only two bytes per scanline:

    add BYTE PTR [esi], al     ; left edge  (+I)   in 0x5e010
    sub BYTE PTR [esi], al     ; right edge (-I)

One pass over the whole bitmap (0x29784) then rebuilds interiors:

    movzx esi,[ecx+ebp]        ; src byte
    add   [esp+4],esi          ; running sum
    mov   bl,[esp+4]
    add   [esi+eax],bl         ; dst += low byte of the sum

Cost per triangle becomes O(height), the O(area) work is paid once per frame, shared by all triangles. Overlaps add
intensity mod 256 (commutative: no sorting, no z-buffer), which gives the demo its look.

## 2. Additive 16.16 line drawer with float clipping (0x5da58)
Clip to the bitmap in float, pick the major axis, convert the slope once (`fmul 65536.0`, truncation via 0x2874a),
then each pixel is `sar edi,16` + `add BYTE PTR [eax], dl` with a single bounds check against 0x4b000.
No Bresenham error term and no pixel read-modify-write beyond the byte add.

## 3. Recursive plane clipper driven by outcodes (0x592d0, ~0xc58 bytes)
Signed distances to 5 planes are stored as outcode bytes; 7 = reject, 1/2/4 = one vertex outside (two triangles, recurse
with plane index+1), 3/5/6 = two outside (one triangle). Shade rides in vertex w so it is interpolated for free.
Alternative candidate: the flat shade in 0x41e30 (acos, linear in angle: shade = 256 - theta*81.487, 81.487 = 256/pi).
