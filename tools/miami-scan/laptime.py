#!/usr/bin/env python3
"""ВРЕМЯ НА КРУГЕ ПРОТИВ МЕСТА НА ТРАССЕ — чтобы ловить стоп-кадры онбоарда.

Владелец смотрит онбоард-видео с таймером круга и делает стоп-кадры; чтобы
он снимал нужные места, а не угадывал их, эта справка переводит наши метры
от линии старта во время того же круга — и обратно.

    python3 tools/openf1-lap.py Miami --year=2025     # или свой запрос к openf1
    node   tools/miami-scan/dump-cl.js
    python3 tools/miami-scan/laptime.py [круг.json]

Совмещение координат F1 с нашим контуром — перебором угла и сдвига, как
в f1fit.py (на круге Ферстаппена 2025 средняя ошибка 2.6 м).

ПРОВЕРЕНО НА ЖИВЫХ КАДРАХ (09.2026): владелец прислал стоп-кадры на 5.1, 6.5,
8.3, 9.5 и 10.8 с — справка дала 401, 444, 528, 597 и 678 м, и это ровно те
места, что на кадрах (выход первого, между 1 и 2, за вторым, третий, выход
третьего). То есть перевод верен, а не правдоподобен.

ОГОВОРКА: время привязано к КОНКРЕТНОМУ кругу (у Ферстаппена в квалификации
Майами 2025 это поул 1:26.204, сектора 28.246/33.079/24.879). На другом круге
или в другой сессии времена сдвинутся — сверяй по секторам.
"""

import json,math,os,datetime
import numpy as np
SCR='/tmp/claude-0/-home-user-apex26/df086c61-ef0e-559e-a37c-41f03c694213/scratchpad'
HERE='/home/user/apex26/tools/miami-scan'
cl=json.load(open(os.path.join(HERE,'centerline.json')))
R=np.array([[-p[0],p[1]] for p in cl['P']])
S=np.array(cl['S']); TOT=cl['len']
d=json.load(open(os.path.join(SCR,'ver2025_full.json')))
lap=d['lap']; loc=[p for p in d['location'] if p['x'] or p['y']]; car=d['car']
F=np.array([[p['x'],p['y']] for p in loc],float)*0.1
def proj(pts):
    A=R; B=np.vstack([R[1:],R[:1]]); V=B-A; L2=(V**2).sum(1); L2[L2==0]=1e-9
    out=[]
    for pt in pts:
        t=np.clip(((pt-A)*V).sum(1)/L2,0,1); P=A+V*t[:,None]
        dd=np.hypot(*(pt-P).T); i=int(np.argmin(dd))
        out.append((dd[i],(S[i]+t[i]*np.hypot(*V[i]))%TOT))
    return out
Fc=F-F.mean(0); Rm=R.mean(0)
def err(deg,off,step=8):
    th=math.radians(deg); c,s=math.cos(th),math.sin(th)
    Fr=Fc@np.array([[c,-s],[s,c]]).T+off+Rm
    return float(np.mean([a for a,_ in proj(Fr[::step])]))
be,bd=min(((err(g,np.zeros(2)),g) for g in np.arange(0,360,1.0))); bo=np.zeros(2)
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
th=math.radians(bd); c,s=math.cos(th),math.sin(th)
W=Fc@np.array([[c,-s],[s,c]]).T+bo+Rm
pr=proj(W); locS=np.array([p[1] for p in pr])
print('совмещение: средняя ошибка %.2f м'%be)
ts=lambda x: datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()
t0=ts(lap['date_start'])
lt=np.array([ts(p['date'])-t0 for p in loc])
uw=locS.copy()
for i in range(1,len(uw)):
    while uw[i]<uw[i-1]-TOT/2: uw[i]+=TOT
# отбросить хвост следующего круга
keep=uw<=TOT+5
lt,uw=lt[keep],uw[keep]
o=np.argsort(uw)
np.save(os.path.join(SCR,'t_of_S.npy'),np.stack([uw[o],lt[o]]))
print('круг %.3f с; первая точка на S=%.0f (t=%.2f с), последняя S=%.0f (t=%.2f)'%(
    lap['lap_duration'],uw[0],lt[0],uw[-1],lt[-1]))
# проверка на кадрах владельца
print('\nпроверка по его кадрам (время -> место):')
for t in (5.1,6.5,8.3,9.5,10.8):
    sv=float(np.interp(t,lt[np.argsort(lt)],uw[np.argsort(lt)]))
    print('   %4.1f с  ->  S = %4.0f м'%(t,sv))
