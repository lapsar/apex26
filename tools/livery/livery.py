#!/usr/bin/env python3
"""Ливрея команды — стилизация фигурами по фото -> запись LIVERY для index.html (v1.17.32, вариант А владельца).
   python3 -I tools/livery/livery.py tools/livery/<команда>.json [--out DIR]
Фото сверху и сбоку совмещаются с болидом по центрам колёс (калибровка вида в json: ppm — пикселей на метр, cx, cy —
пиксель центра переднего колеса; модель W17: ось z +1.80, колесо R 0.355). Фигуры обводятся В ПИКСЕЛЯХ ИСХОДНОГО ФОТО
(сетка — grid.py) и переводятся в метры болида: сверху (z, |x|) — обводить нижнюю половину фото; сбоку (z, y).
  shapes: {"c": слой, "p": [[x,y],…]} — многоугольник; {"c": слой, "line": [[x,y],…], "w": толщина в пикселях} — линия;
          "smooth": true — точки сглаживаются кривой (Катмулл — Ром), для плавных краёв;
          "wrap": true (вид сверху) — фигура переносится и на вид сбоку ЧЕРЕЗ МОДЕЛЬ: wrap.js бросает луч сверху на кузов
          и берёт высоту точки (полосы на скате понтона: иначе две карты рисуют полосу в разных местах кузова, и она рвётся).
          Порядок: livery.py → node tools/livery/wrap.js <key> → livery.py ещё раз (берёт <key>.wrap.json).
  base — цвет кузова под всем; layers — до 4 слоёв поверх (порядок = порядок наложения); palette — [цвет, металличность].
Выход: <key>.livery.js — строка для LIVERY в index.html (заменить строку команды целиком), фигуры в миллиметрах;
<key>_top.png / <key>_side.png — карты для проверки глазом (без сглаживания краёв, его делает игра полем расстояний)."""
import sys,json,os
from PIL import Image,ImageDraw
LIV_Z0,LIV_Z1,LIV_X,LIV_Y,W,H=-2.45,3.25,1.0,1.28,512,128
def cr(pts,closed,n=6):
  """Кривая Катмулла — Рома через точки (n отрезков на промежуток); замкнутая — для многоугольника."""
  if len(pts)<3:return pts
  N=len(pts);g=(lambda k:pts[k%N]) if closed else (lambda k:pts[min(max(k,0),N-1)]);out=[]
  for i in range(N if closed else N-1):
    p0,p1,p2,p3=g(i-1),g(i),g(i+1),g(i+2)
    for k in range(n):
      t=k/n;t2=t*t;t3=t2*t
      out.append(tuple(0.5*(2*p1[j]+(p2[j]-p0[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2+(3*p1[j]-p0[j]-3*p2[j]+p3[j])*t3) for j in (0,1)))
  if not closed:out.append(tuple(pts[-1]))
  return out
def main():
  cfgp=sys.argv[1];out=sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else os.path.dirname(cfgp)
  cfg=json.load(open(cfgp));pal=cfg['palette'];layers=cfg['layers'];assert len(layers)<=4
  res={}
  for view in ('top','side'):
    V=cfg[view];ppm,cx,cy=V['ppm'],V['cx'],V['cy'];ext=LIV_X if view=='top' else LIV_Y
    def m(q):
      z=1.80-(q[0]-cx)/ppm;v=abs(q[1]-cy)/ppm if view=='top' else 0.355+(cy-q[1])/ppm;return (z,v)
    img=Image.new('RGB',(W*2,H*2),tuple(int(pal[cfg['base']][0][i:i+2],16) for i in (1,3,5)));d=ImageDraw.Draw(img)
    tx=lambda p:((p[0]-LIV_Z0)/(LIV_Z1-LIV_Z0)*W*2,p[1]/ext*H*2)
    arr=[];wrap=[]
    if view=='side':
      wp=os.path.join(os.path.dirname(os.path.abspath(cfgp)),cfg['key']+'.wrap.json')
      if os.path.exists(wp):
        for s2 in json.load(open(wp)):
          L=layers.index(s2['c'])+1;mp=[tuple(q) for q in s2['p']]
          col=tuple(int(pal[s2['c']][0][i:i+2],16) for i in (1,3,5));d.polygon([tx(p) for p in mp],fill=col)
          arr.append('['+','.join([str(L),'0']+[str(round(c*1000)) for p in mp for c in p])+']')
    for s in V['shapes']:
      L=layers.index(s['c'])+1;line='line' in s;pts=[tuple(q) for q in (s['line'] if line else s['p'])]
      if s.get('smooth'):pts=cr(pts,not line)
      mp=[m(q) for q in pts];w=s.get('w',0)/ppm if line else 0
      if s.get('wrap'):   # линия — контуром толщины w (слева туда, справа обратно)
        if line:
          import math;Lf=[];Rt=[]
          for i,p in enumerate(mp):
            a_=mp[max(i-1,0)];b_=mp[min(i+1,len(mp)-1)];dx,dy=b_[0]-a_[0],b_[1]-a_[1];n=math.hypot(dx,dy) or 1;nx,ny=-dy/n*w/2,dx/n*w/2
            Lf.append((p[0]+nx,p[1]+ny));Rt.append((p[0]-nx,p[1]-ny))
          wrap.append({'c':s['c'],'p':Lf+Rt[::-1]})
        else:wrap.append({'c':s['c'],'p':mp})
      col=tuple(int(pal[s['c']][0][i:i+2],16) for i in (1,3,5))
      if line:d.line([tx(p) for p in mp],fill=col,width=max(1,int(round(w/ext*H*2))),joint='curve')
      else:d.polygon([tx(p) for p in mp],fill=col)
      arr.append('['+','.join([str(L),str(round(w*1000))]+[str(round(c*1000)) for p in mp for c in p])+']')
    img.save(os.path.join(out,cfg['key']+'_'+view+'.png'));res[view]='['+','.join(arr)+']'
    if view=='top':json.dump(wrap,open(os.path.join(os.path.dirname(os.path.abspath(cfgp)),cfg['key']+'.towrap.json'),'w'))
  P=lambda n:"['%s',%s]"%(pal[n][0],pal[n][1])
  js=("  '%s':{team:'%s',halo:'%s',base:%s,layers:[%s],\n    top:%s,\n    side:%s},   // %s\n"%(cfg['color'].upper(),cfg['team'],cfg['halo'],P(cfg['base']),
      ','.join(P(n) for n in layers),res['top'],res['side'],cfg.get('src','')))
  open(os.path.join(out,cfg['key']+'.livery.js'),'w').write(js)
  print(cfg['key'],'знаков',len(js),'фигур сверху',len(cfg['top']['shapes']),'сбоку',len(cfg['side']['shapes']))
main()
