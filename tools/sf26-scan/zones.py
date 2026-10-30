import numpy as np,sys
src=open('inspect.py').read().split("allp=[]")[0]; exec(src)
pts=[]
def walk(i,P):
    nd=g['nodes'][i]; M=P@mat(nd)
    if 'mesh' in nd:
        for pr in g['meshes'][nd['mesh']]['primitives']:
            p=acc(pr['attributes']['POSITION']).astype(float); pts.append((M@np.c_[p,np.ones(len(p))].T).T[:,:3])
    for c in nd.get('children',[]): walk(c,M)
walk(0,np.eye(4)); A=np.vstack(pts)
fz=1.522; rz=-2.011
f=A[A[:,2]>fz+0.36]; print('ahead of front tyres: |x|max',abs(f[:,0]).max().round(3),'y max',f[:,1].max().round(3),'nose z',A[:,2].max().round(3))
r=A[A[:,2]<rz-0.36]; print('behind rear tyres: |x|max',abs(r[:,0]).max().round(3),'y max',r[:,1].max().round(3),'tail z',A[:,2].min().round(3))
m=A[(A[:,2]<fz-0.36)&(A[:,2]>rz+0.36)]; print('between axles |x|max',abs(m[:,0]).max().round(3),'y max',m[:,1].max().round(3))
