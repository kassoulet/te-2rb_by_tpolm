#!/usr/bin/env python3
"""export3ds.py [OUTDIR=web/data]: every ../*.3DS -> OUTDIR/mesh/<name>.json
{objects:[{name,kind,v:[x,y,z,...],f:[a,b,c,...],uv:[u,v,...],mats:[[name,[face idx...]]],xform:[12 floats]}], cams, lights, materials}
Vertices are in object-local space as stored (3DS has +Z up; xform = 4x3 local matrix, apply if needed)."""
import sys, os, glob, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse3ds
R = lambda xs: [round(x, 4) for x in xs]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
od = (sys.argv[1] if len(sys.argv) > 1 else root + '/web/data') + '/mesh'; os.makedirs(od, exist_ok=True)
for f in sorted(glob.glob(root + '/*.3DS')):
    r, d = parse3ds.parse(f); out = {'objects': [], 'materials': r['materials']}
    for o in r['objects']:
        e = {'name': o['name'], 'kind': o['kind']}
        if o['verts']:
            e['v'] = R(struct.unpack_from('<%df' % (3 * o['verts']), d, o['vdata']))
            fa = () if 'fdata' not in o else struct.unpack_from('<%dH' % (4 * o['faces']), d, o['fdata'])
            e['f'] = [x for i in range(len(fa)//4) for x in fa[4*i:4*i+3]]
            if o['uv']: e['uv'] = R(struct.unpack_from('<%df' % (2 * o['uv']), d, o['uvdata']))
            if o['mats']: e['mats'] = [[n, c] for n, c in o['mats']]
        for k in ('xform', 'cam', 'pos'):
            if k in o: e[k] = R(o[k])
        out['objects'].append(e)
    p = '%s/%s.json' % (od, os.path.basename(f)[:-4].lower())
    json.dump(out, open(p, 'w'), separators=(',', ':'))
    print(p, os.path.getsize(p), [(o['name'], len(o.get('v', [])) // 3, len(o.get('f', [])) // 3) for o in out['objects']])
