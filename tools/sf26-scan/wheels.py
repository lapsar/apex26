import json,sys,numpy as np
exec(open('inspect.py').read().split("allp=[]")[0])
# scene root transforms: compute world for Object_10 (tyre_tread)
def world(name):
    out=[]
    def walk(i,P):
        nd=g['nodes'][i]; M=P@mat(nd)
        if nd.get('name')==name:
            for pr in g['meshes'][nd['mesh']]['primitives']:
                p=acc(pr['attributes']['POSITION']).astype(float); out.append((M@np.c_[p,np.ones(len(p))].T).T[:,:3])
        for c in nd.get('children',[]): walk(c,M)
    walk(0,np.eye(4)); return np.vstack(out)
for nm in ['Object_10','Object_8','Object_9']:
    w=world(nm)
    for sx in (1,-1):
        for sz in (1,-1):
            q=w[(np.sign(w[:,0])==sx)&(np.sign(w[:,2]-(-0.25))==sz)]
            c=(q.min(0)+q.max(0))/2; s=q.max(0)-q.min(0)
            print(nm,'x' if sx>0 else '-x','front' if sz>0 else 'rear','centre',c.round(3),'size',s.round(3))
