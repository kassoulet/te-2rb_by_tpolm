#!/usr/bin/env python3
"""parse3ds.py FILE.3DS [--chunks] : print catalogue of a 3D Studio R3/R4 file (objects, verts, faces, UV, materials, keyframer, camera/light)."""
import struct,sys
NAMES={0x4D4D:'MAIN',0x3D3D:'EDIT',0x4000:'OBJ',0x4100:'MESH',0x4110:'VERTS',0x4120:'FACES',0x4130:'FMAT',0x4140:'UV',0x4150:'SMOOTH',0x4160:'XFORM',
 0x4600:'LIGHT',0x4700:'CAMERA',0xAFFF:'MATERIAL',0xA000:'MATNAME',0xA200:'TEXMAP',0xA300:'MAPFILE',0xA220:'REFLMAP',0xA230:'BUMPMAP',0xB000:'KFDATA',
 0xB002:'OBJNODE',0xB003:'CAMNODE',0xB004:'TGTNODE',0xB005:'LIGHTNODE',0xB006:'SPOTTGT',0xB007:'SPOTNODE',0xB008:'KFSEG',0xB009:'KFCURTIME',0xB00A:'KFHDR',
 0xB010:'NODEHDR',0xB013:'PIVOT',0xB020:'POS',0xB021:'ROT',0xB022:'SCL',0xB023:'FOV',0xB024:'ROLL',0xB030:'NODEID',0x0100:'MASTERSCALE',0x3D3E:'MESHVER',0x0002:'VER',
 0xA010:'AMB',0xA020:'DIFF',0xA030:'SPEC',0x0010:'RGBF',0x0011:'RGB24',0x4010:'HIDDEN',0x4620:'SPOT',0x4610:'LIGHTONOFF',0xA040:'SHININESS',0xA050:'TRANSP',0xA081:'TWOSIDE',0xA100:'SHADING',0x7001:'VIEWPORT',0x1100:'BGBM',0x2100:'AMBIENT',0x1200:'BGCOL'}
def walk(d,o,end,depth,cb):
    while o+6<=end:
        cid,ln=struct.unpack_from('<HI',d,o)
        if ln<6: break
        cb(cid,o,ln,depth)
        o+=ln
def parse(path,show=False):
    d=open(path,'rb').read(); res={'objects':[],'materials':[],'kf':[],'cams':[],'lights':[]}
    cur=[None]
    def cstr(o):
        e=d.index(b'\0',o); return d[o:e].decode('latin1'),e+1
    def cb(cid,o,ln,depth):
        if show: print('  '*depth+'%04X %s len=%d'%(cid,NAMES.get(cid,'?'),ln))
        b=o+6;end=o+ln
        if cid in(0x4D4D,0x3D3D,0x4100,0xAFFF,0xA200,0xA220,0xA230,0xB000,0xA010,0xA020,0xA030):
            walk(d,b,end,depth+1,cb)
        elif cid==0x4000:
            n,p=cstr(b); cur[0]={'name':n,'verts':0,'faces':0,'uv':0,'kind':'mesh','mats':[]}; res['objects'].append(cur[0]); walk(d,p,end,depth+1,cb)
        elif cid==0x4110: cur[0]['verts']=struct.unpack_from('<H',d,b)[0]; cur[0]['vdata']=(b+2)
        elif cid==0x4120:
            n=struct.unpack_from('<H',d,b)[0]; cur[0]['faces']=n; cur[0]['fdata']=b+2; walk(d,b+2+8*n,end,depth+1,cb)
        elif cid==0x4140: cur[0]['uv']=struct.unpack_from('<H',d,b)[0]; cur[0]['uvdata']=b+2
        elif cid==0x4160: cur[0]['xform']=struct.unpack_from('<12f',d,b)
        elif cid==0x4700: cur[0]['kind']='camera'; cur[0]['cam']=struct.unpack_from('<8f',d,b); res['cams'].append(cur[0]['name'])
        elif cid==0x4600: cur[0]['kind']='light'; cur[0]['pos']=struct.unpack_from('<3f',d,b)
        elif cid==0x4130:
            n,p=cstr(b); cnt=struct.unpack_from('<H',d,p)[0]; cur[0]['mats'].append((n,cnt))
        elif cid==0xA000: n,_=cstr(b); res['materials'].append({'name':n,'maps':[]})
        elif cid==0xA300: n,_=cstr(b); res['materials'][-1]['maps'].append(n)
    walk(d,0,len(d),0,cb)
    return res,d
if __name__=='__main__':
    r,d=parse(sys.argv[1],'--chunks' in sys.argv)
    for o in r['objects']: print(o['name'],o['kind'],'v',o['verts'],'f',o['faces'],'uv',o['uv'],o['mats'])
    print('materials',r['materials'])
