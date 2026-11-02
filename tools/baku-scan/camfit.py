# Подгонка камеры онбоарда по точкам модели W17 (колёса, гало, зеркала, горизонт), кадр 420 в 1280x720; 01.11.2026, game.md
import numpy as np, sys
F=[ # (точка модели), (u или None, v или None), вес
 ((+0.78,0.71,1.80),(370,268)),((-0.78,0.71,1.80),(980,268)),
 ((+0.94,0.355,1.80),(280,None)),((-0.94,0.355,1.80),(1080,None)),
 ((+0.62,0.355,1.80),(463,None)),((-0.62,0.355,1.80),(880,None)),
 ((0,0.976,0.62),(None,293)),
 ((+0.62,0.75,0.70),(212,443)),((-0.62,0.75,0.70),(1205,435)),
]
VH=115
def proj(q,P):
  cx,cy,cz,psi,th,hf=q
  f=np.array([np.sin(psi)*np.cos(th),-np.sin(th),np.cos(psi)*np.cos(th)])
  r=np.cross(f,[0,1,0]);r/=np.linalg.norm(r);u=np.cross(r,f)
  p=np.array(P)-[cx,cy,cz];fp=640/np.tan(np.radians(hf/2))
  return 640+p@r/(p@f)*fp, 360-p@u/(p@f)*fp
def res(q,skip=()):
  R=[]
  for i,(P,(u,v)) in enumerate(F):
    if i in skip: continue
    pu,pv=proj(q,P)
    if u is not None:R.append(pu-u)
    if v is not None:R.append(pv-v)
  fp=640/np.tan(np.radians(q[5]/2));R.append(360-fp*np.tan(q[4])-VH)
  return np.array(R)
def fit(q0,skip=(),fix=None):
  q=np.array(q0,float)
  idx=[i for i in range(6) if not (fix and i in fix)]
  lam=1e-2
  for it in range(400):
    r=res(q,skip);J=np.zeros((len(r),len(idx)))
    for j,i in enumerate(idx):
      d=np.zeros(6);d[i]=1e-5;J[:,j]=(res(q+d,skip)-r)/1e-5
    A=J.T@J;g=J.T@r
    step=np.linalg.solve(A+lam*np.diag(np.diag(A)+1e-9),-g)
    qn=q.copy();qn[idx]+=step
    if (res(qn,skip)**2).sum()<(r**2).sum():q=qn;lam*=0.5
    else:lam*=4
  return q,res(q,skip)
for q0 in ([0,1.2,-0.1,0,0.3,80],[0,1.0,0.2,0,0.3,90],[0,1.3,-0.6,0,0.25,64]):
  q,r=fit(q0)
  print('x %.2f y %.2f z %.2f рыск %.1f° наклон %.1f° обзор %.1f°'%(q[0],q[1],q[2],np.degrees(q[3]),np.degrees(q[4]),q[5]),' невязка px',np.abs(r).round(0).astype(int).tolist())
q,r=fit([0,1.2,-0.1,0,0.3,80])
P=(0,0.82,0.24);print('наш шлем: верх (0,0.965,0.24) ->',np.round(proj(q,(0,0.965,0.24))),' центр->',np.round(proj(q,P)))
print('--- варианты')
def show(tag,q,r): print(tag,'x %.2f y %.2f z %.2f наклон %.1f° обзор %.1f°'%(q[0],q[1],q[2],np.degrees(q[4]),q[5]),'rms %.0f px'%np.sqrt((r**2).mean()),'max',int(np.abs(r).max()))
show('всё свободно      ',*fit([0,1.2,-0.1,0,0.3,80]))
show('без кромок колёс  ',*fit([0,1.2,-0.1,0,0.3,80],skip=(2,3,4,5)))
for z in (0.0,-0.1,-0.2,-0.4):
  q0=[0,1.2,z,0,0.3,80];show('z=%.1f закреплён   '%z,*fit(q0,fix=(2,)))
q0=[0,1.28,-0.05,0,0.31,80];show('y=1.28 закреплён  ',*fit(q0,fix=(1,)))
q=np.array([0,1.28,-0.05,0,np.radians(17.8),80]);r=res(q);show('мой прошлый (в)   ',q,r)
print('--- шлем при камере «без кромок колёс»')
q,r=fit([0,1.2,-0.1,0,0.3,80],skip=(2,3,4,5))
def sphere(q,c,R):
  pts=[]
  for a in np.linspace(0,np.pi,60):
    for b in np.linspace(0,2*np.pi,120):
      P=np.array(c)+R*np.array([np.sin(a)*np.cos(b),np.cos(a),np.sin(a)*np.sin(b)])
      pts.append(proj(q,P))
  p=np.array(pts);return p[:,0].min(),p[:,0].max(),p[:,1].min(),p[:,1].max()
for dz in (0,0.1,0.2,0.24):
  for R in (0.145,):
    print('шлем z %.2f R %.3f: x %.0f..%.0f, верх y %.0f, низ y %.0f'%((0.24+dz,R)+sphere(q,(0,0.82,0.24+dz),R)))
print('--- где должен быть шлем R 0.145, чтобы верх был на y 560 (онбоард)')
best=[]
for zc in np.arange(0.0,0.45,0.04):
  for yc in np.arange(0.60,0.90,0.01):
    x0,x1,t,b=sphere(q,(0,yc,zc),0.145)
    best.append((abs(t-560),zc,yc,x1-x0))
best.sort()
for e in best[:12]: print('z %.2f y %.2f  ширина %.0f px'%(e[1],e[2],e[3]))
