# Подгонка камеры онбоарда (кадр 420) с шлемом и бочкообразным искажением объектива; 01.11.2026, game.md «Замер (в)»
import numpy as np
F=[((+0.78,0.71,1.80),(370,268)),((-0.78,0.71,1.80),(980,268)),((+0.94,0.355,1.80),(280,None)),((-0.94,0.355,1.80),(1080,None)),
   ((+0.62,0.355,1.80),(463,None)),((-0.62,0.355,1.80),(880,None)),((0,0.976,0.67),(None,293)),((+0.62,0.75,0.70),(212,443)),((-0.62,0.75,0.70),(1205,435))]
U=np.linspace(0,np.pi,30);V=np.linspace(0,2*np.pi,60)
SPH=np.array([[np.sin(a)*np.cos(b),np.cos(a),np.sin(a)*np.sin(b)] for a in U for b in V])
def basis(q):
  psi,th=q[3],q[4];f=np.array([np.sin(psi)*np.cos(th),-np.sin(th),np.cos(psi)*np.cos(th)]);r=np.cross(f,[0,1,0]);r/=np.linalg.norm(r);return f,r,np.cross(r,f)
def P2(q,P):
  f,r,u=basis(q);p=np.atleast_2d(P)-q[:3];fp=640/np.tan(np.radians(q[5]/2));x=(p@r)/(p@f);y=-(p@u)/(p@f)
  k=q[6];rr=x*x+y*y;s=1+k*rr;return 640+x*s*fp,360+y*s*fp
def res(q,HY,use_h=True):
  R=[]
  for P,(u,v) in F:
    pu,pv=P2(q,P)
    if u is not None:R.append(pu[0]-u)
    if v is not None:R.append(pv[0]-v)
  f,r,u_=basis(q);fp=640/np.tan(np.radians(q[5]/2));y=np.tan(q[4]);R.append(360-y*(1+q[6]*y*y)*fp-115)
  if use_h:
    pu,pv=P2(q,np.array([0,HY,0.24])+0.145*SPH);R.append(pv.min()-560)
  return np.array(R)
def fit(q0,HY,fix=()):
  q=np.array(q0,float);idx=[i for i in range(7) if i not in fix];lam=1e-2
  for it in range(300):
    r=res(q,HY);J=np.zeros((len(r),len(idx)))
    for j,i in enumerate(idx):
      d=np.zeros(7);d[i]=1e-5;J[:,j]=(res(q+d,HY)-r)/1e-5
    A=J.T@J;st=np.linalg.solve(A+lam*np.diag(np.diag(A)+1e-9),-J.T@r);qn=q.copy();qn[idx]+=st
    if (res(qn,HY)**2).sum()<(r**2).sum():q=qn;lam*=0.5
    else:lam*=4
  return q,res(q,HY)
for HY in (0.82,0.72):
  for k0,fix in ((0,(6,)),(-0.1,())):
    q,r=fit([0,1.15,-0.1,0,0.33,80,k0],HY,fix)
    print('шлем %.2f %s: y %.2f z %.2f x %.2f наклон %.1f° обзор %.1f° k %.3f  rms %.1f max %.0f'%(HY,'с бочкой' if not fix else 'без бочки',q[1],q[2],q[0],np.degrees(q[4]),q[5],q[6],np.sqrt((r**2).mean()),np.abs(r).max()))
