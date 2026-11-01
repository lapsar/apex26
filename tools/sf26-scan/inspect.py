# Замер В (30.10.2026): узлы, габарит, треугольники и материалы glTF-модели. python3 -I inspect.py путь/scene.gltf
import json,sys,struct
import numpy as np
gp=sys.argv[1]; g=json.load(open(gp)); binp=gp.replace('scene.gltf','scene.bin'); B=open(binp,'rb').read()
print('ext',g.get('extensionsUsed'))
def acc(i):
    a=g['accessors'][i]; bv=g['bufferViews'][a['bufferView']]
    comp={5126:'f4',5125:'u4',5123:'u2',5121:'u1'}[a['componentType']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0); st=bv.get('byteStride',0)
    isz=np.dtype(comp).itemsize*n
    if st and st!=isz:
        raw=np.frombuffer(B,dtype=np.uint8,count=st*(a['count']-1)+isz,offset=off)
        arr=np.stack([np.frombuffer(raw[k*st:k*st+isz].tobytes(),dtype=comp) for k in range(a['count'])])
    else:
        arr=np.frombuffer(B,dtype=comp,count=a['count']*n,offset=off).reshape(a['count'],n)
    return arr
def mat(nd):
    if 'matrix' in nd: return np.array(nd['matrix']).reshape(4,4).T
    M=np.eye(4)
    t=nd.get('translation',[0,0,0]); r=nd.get('rotation',[0,0,0,1]); s=nd.get('scale',[1,1,1])
    x,y,z,w=r
    R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    M[:3,:3]=R@np.diag(s); M[:3,3]=t; return M
allp=[]; rows=[]
def walk(i,P,d):
    nd=g['nodes'][i]; M=P@mat(nd)
    if 'mesh' in nd:
        m=g['meshes'][nd['mesh']]
        for pr in m['primitives']:
            p=acc(pr['attributes']['POSITION']).astype(float)
            w=(M@np.c_[p,np.ones(len(p))].T).T[:,:3]
            tri=(g['accessors'][pr['indices']]['count']//3) if 'indices' in pr else len(p)//3
            allp.append(w); mt=g['materials'][pr.get('material',0)]
            rows.append((nd.get('name',''),mt.get('name',''),tri,len(p),w.min(0),w.max(0),list(pr['attributes'].keys())))
    print('  '*d+str(i),nd.get('name',''),'mesh' if 'mesh' in nd else '', 'T' if any(k in nd for k in ('matrix','translation','rotation','scale')) else '')
    for c in nd.get('children',[]): walk(c,M,d+1)
walk(0,np.eye(4),0)
A=np.vstack(allp); print('BBOX min',A.min(0).round(3),'max',A.max(0).round(3),'size',(A.max(0)-A.min(0)).round(3))
tot=0
for r in sorted(rows,key=lambda r:-r[2]):
    tot+=r[2]; print(f'{r[2]:8d} tri {r[3]:7d} v  {r[1][:28]:28s} {r[0][:30]:30s} min{r[4].round(2)} max{r[5].round(2)} {",".join(a for a in r[6] if a not in("POSITION","NORMAL"))}')
print('TOTAL tri',tot,'prims',len(rows))
for m in g['materials']:
    pb=m.get('pbrMetallicRoughness',{})
    print(m['name'][:30],'alpha',m.get('alphaMode','OPAQUE'),'col',[round(c,2) for c in pb.get('baseColorFactor',[1,1,1,1])],'tex' if 'baseColorTexture' in pb else '','met',pb.get('metallicFactor',1),'rgh',pb.get('roughnessFactor',1),list(m.get('extensions',{}).keys()))
