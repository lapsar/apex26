#!/usr/bin/env python3
"""ГДЕ В ЖИЗНИ ТОРМОЗЯТ на круге: телеметрия F1 (openf1.org) на нашу осевую.

Этим замером выбраны зоны щитов торможения Майами (v1.15.87): щит ставится там,
где тормоз в жизни нажат долго и с высокой скорости, а не «где кажется нужным».

    python3 tools/openf1-lap.py Miami          # сначала скачать круг -> miami_lap.json
    node   tools/miami-scan/dump-cl.js         # и осевую из игры -> centerline.json
    python3 tools/miami-scan/brakepoints.py [miami_lap.json]

Совмещение координат F1 с нашим контуром — перебором угла и сдвига, как в f1fit.py
(средняя ошибка 2.5 м). Наша осевая отражена по X (ловушка N1 проекта, §7), поэтому
здесь она возвращается в географию: East = -x, North = z.

ОГОВОРКИ. Частота телеметрии 3.7 Гц — точка каждые 16-25 м, поэтому границы
эпизода торможения известны с точностью до этих же метров. `brake` в openf1 —
это 0/100, а не усилие: длина эпизода говорит только о том, что педаль нажата.
"""

import json, math, os, sys
import numpy as np

HERE=os.path.dirname(os.path.abspath(__file__))
SCR=os.getcwd()
cl=json.load(open(os.path.join(HERE,'centerline.json')))
# игра отражена по X: возвращаем географию (East=-x, North=z)
R=np.array([[-p[0],p[1]] for p in cl['P']])
S=np.array(cl['S']); TOT=cl['len']
LAPF=sys.argv[1] if len(sys.argv)>1 else 'miami_lap.json'
lap=json.load(open(LAPF))
loc=lap['location']; car=lap['car']
F=np.array([[p['x'],p['y']] for p in loc],float)*0.1

def proj(pts):
    """для каждой точки: (расстояние до осевой, S)"""
    A=R; B=np.vstack([R[1:],R[:1]]); V=B-A; L2=(V**2).sum(1); L2[L2==0]=1e-9
    out=[]
    for pt in pts:
        t=np.clip(((pt-A)*V).sum(1)/L2,0,1); P=A+V*t[:,None]
        d=np.hypot(*(pt-P).T); i=int(np.argmin(d))
        seg=np.hypot(*V[i]); out.append((d[i], (S[i]+t[i]*seg)%TOT))
    return out

Fc=F-F.mean(0); Rm=R.mean(0)
def err(deg,off,step=8):
    th=math.radians(deg); c,s=math.cos(th),math.sin(th)
    Fr=Fc@np.array([[c,-s],[s,c]]).T+off+Rm
    return float(np.mean([d for d,_ in proj(Fr[::step])]))
best=min(((err(g,np.zeros(2)),g) for g in np.arange(0,360,1.0)))
be,bd=best; bo=np.zeros(2)
for it in range(4):
    ds,os_=1.0/2**it,8.0/2**it; moved=True
    while moved:
        moved=False
        for dd in (-ds,0,ds):
            for dx in (-os_,0,os_):
                for dy in (-os_,0,os_):
                    if dd==dx==dy==0: continue
                    e=err(bd+dd,bo+np.array([dx,dy]))
                    if e<be-1e-3: be,bd,bo=e,bd+dd,bo+np.array([dx,dy]); moved=True
print('совмещение: угол %.2f°, сдвиг (%.1f, %.1f), средняя ошибка %.2f м'%(bd,bo[0],bo[1],be))
th=math.radians(bd); c,s=math.cos(th),math.sin(th)
W=Fc@np.array([[c,-s],[s,c]]).T+bo+Rm
pr=proj(W)
locS=np.array([p[1] for p in pr]); locD=np.array([p[0] for p in pr])
print('отход реальной линии от осевой: медиана %.1f м, макс %.1f м'%(np.median(locD),locD.max()))

# время -> S: car_data по датам
import datetime
def ts(x): return datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()
lt=np.array([ts(p['date']) for p in loc]); ct=np.array([ts(p['date']) for p in car])
# S монотонна по кругу: разворачиваем
uw=locS.copy()
for i in range(1,len(uw)):
    while uw[i]<uw[i-1]-TOT/2: uw[i]+=TOT
carS=np.interp(ct,lt,uw)%TOT
spd=np.array([p['speed'] for p in car]); brk=np.array([p['brake'] for p in car])

o=np.argsort(carS); carS,spd,brk=carS[o],spd[o],brk[o]
print('\nТОРМОЖЕНИЯ (тормоз нажат, эпизоды длиннее 40 м):')
print('  начало S   конец S   длина   скорость  до -> после')
ep=[];i=0
while i<len(brk):
    if brk[i]>0:
        j=i
        while j+1<len(brk) and brk[j+1]>0: j+=1
        a,b=carS[i],carS[j]
        if b-a>=40: ep.append((a,b,spd[max(0,i-1)],spd[min(len(spd)-1,j+1)]))
        i=j+1
    else: i+=1
for a,b,v0,v1 in ep:
    print('   %6.0f    %6.0f   %4.0f м   %3d -> %3d км/ч'%(a,b,b-a,v0,v1))
