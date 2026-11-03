#!/usr/bin/env python3
"""Ливрея команды — стилизация фигурами по фото -> запись LIVERY для index.html (v1.17.32, вариант А владельца).
   python3 -I tools/livery/livery.py tools/livery/<команда>.json [--out DIR]
Фото сверху и сбоку совмещаются с болидом по центрам колёс (калибровка вида в json: ppm — пикселей на метр, cx, cy —
пиксель центра переднего колеса; модель W17: ось z +1.80, колесо R 0.355). Фигуры обводятся В ПИКСЕЛЯХ ИСХОДНОГО ФОТО
(сетка — grid.py) и переводятся в метры болида: сверху (z, |x|) — обводить нижнюю половину фото; сбоку (z, y).
  shapes: {"c": слой, "p": [[x,y],…]} — многоугольник; {"c": слой, "line": [[x,y],…], "w": толщина в пикселях} — линия;
          "smooth": true — точки сглаживаются кривой (Катмулл — Ром), для плавных краёв;
          "stars": [[x, y, r, поворот°], …] — россыпь трёхлучевых звёзд (поворот по умолчанию — от номера звезды);
          "wrap": true — фигура переносится и на другой вид ЧЕРЕЗ МОДЕЛЬ: wrap.js бросает луч на кузов (сверху — вниз,
          сбоку — поперёк) и берёт высоту (или |x|) точки — иначе на скате две карты рисуют фигуру в разных местах, и она рвётся.
          Порядок: livery.py → node tools/livery/wrap.js <key> → livery.py ещё раз (берёт <key>.wrap.json).
          "wrap": "up" (только сверху → сбоку, v1.17.34) — переносится лишь КРАЙ фигуры (точки не на оси, |x| > 2 см), а на виде
          сбоку поле закрывается вверх до крыши карты: белый верх кузова, где луч по оси падает в проём кокпита (Ferrari).
  base — цвет кузова под всем; layers — до 4 слоёв поверх (порядок = порядок наложения); palette — [цвет, металличность];
  ol — кайма слоя (v1.17.35, бык Red Bull): {"c": слой, "w": ширина, м, "col": цвет из palette} — шейдер рисует её по полю
        расстояний того же слоя (край, раздвинутый на w), под самим слоем; фигур и каналов не тратит.
  num — номер пилота: w — полутолщина штриха, o — контур (0 — заливка) в высотах цифры, i — наклон курсива (доля высоты,
        0 — прямые), nose/side — цвет, hn/hs — высота, м.
Выход: <key>.livery.js — строка для LIVERY в index.html (заменить строку команды целиком), фигуры в миллиметрах;
<key>_top.png / <key>_side.png — карты для проверки глазом (без сглаживания краёв, его делает игра полем расстояний)."""
import sys,json,os,math
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
  res={};allwrap=[]
  for view in ('top','side'):
    V=cfg[view];ppm,cx,cy=V['ppm'],V['cx'],V['cy'];ext=LIV_X if view=='top' else LIV_Y
    def m(q):
      z=1.80-(q[0]-cx)/ppm;v=abs(q[1]-cy)/ppm if view=='top' else 0.355+(cy-q[1])/ppm;return (z,v)
    img=Image.new('RGB',(W*2,H*2),tuple(int(pal[cfg['base']][0][i:i+2],16) for i in (1,3,5)));d=ImageDraw.Draw(img)
    tx=lambda p:((p[0]-LIV_Z0)/(LIV_Z1-LIV_Z0)*W*2,p[1]/ext*H*2)
    arr=[];wrap=[]
    wp=os.path.join(os.path.dirname(os.path.abspath(cfgp)),cfg['key']+'.wrap.json')
    if os.path.exists(wp):
        for s2 in [q for q in json.load(open(wp)) if q.get('to','side')==view]:
          L=layers.index(s2['c'])+1;mp=[tuple(q) for q in s2['p']]
          if s2.get('up'):mp=mp+[(mp[-1][0],LIV_Y),(mp[0][0],LIV_Y)]   # край — снизу, до крыши карты — сверху
          col=tuple(int(pal[s2['c']][0][i:i+2],16) for i in (1,3,5));d.polygon([tx(p) for p in mp],fill=col)
          arr.append('['+','.join([str(L),'0']+[str(round(c*1000)) for p in mp for c in p])+']')
    shapes=[]
    for s in V['shapes']:   # звёзды — каждая своим многоугольником (3 луча, поворот — от номера, без случайности)
      if 'stars' in s:
        for k,(x,y,r,*rot) in enumerate(s['stars']):
          a0=math.radians(rot[0] if rot else (k*47)%120);ri=r*s.get('inner',0.2);pts=[]
          for j in range(6):
            ang=a0+j*math.pi/3;rr=r if j%2==0 else ri;pts.append([x+rr*math.sin(ang),y-rr*math.cos(ang)])
          shapes.append({'c':s['c'],'p':pts,'wrap':s.get('wrap',False)})
      else:shapes.append(s)
    for s in shapes:
      L=layers.index(s['c'])+1;line='line' in s;pts=[tuple(q) for q in (s['line'] if line else s['p'])]
      if s.get('smooth'):pts=cr(pts,not line)
      mp=[m(q) for q in pts];w=s.get('w',0)/ppm if line else 0
      if s.get('wrap'):   # линия — контуром толщины w (слева туда, справа обратно)
        if line:
          Lf=[];Rt=[]
          for i,p in enumerate(mp):
            a_=mp[max(i-1,0)];b_=mp[min(i+1,len(mp)-1)];dx,dy=b_[0]-a_[0],b_[1]-a_[1];n=math.hypot(dx,dy) or 1;nx,ny=-dy/n*w/2,dx/n*w/2
            Lf.append((p[0]+nx,p[1]+ny));Rt.append((p[0]-nx,p[1]-ny))
          wrap.append({'c':s['c'],'p':Lf+Rt[::-1],'from':view})
        elif s.get('wrap')=='up':
          i0=next(i for i,p in enumerate(mp) if p[1]>0.02);ch=mp[i0:]+mp[:i0];ch=[p for p in ch if p[1]>0.02]   # край без точек на оси (сглаживание даёт на оси до 1 см), по обходу
          wrap.append({'c':s['c'],'p':ch,'from':view,'open':True,'up':True})
        else:wrap.append({'c':s['c'],'p':mp,'from':view})
      col=tuple(int(pal[s['c']][0][i:i+2],16) for i in (1,3,5))
      if line:d.line([tx(p) for p in mp],fill=col,width=max(1,int(round(w/ext*H*2))),joint='curve')
      else:d.polygon([tx(p) for p in mp],fill=col)
      arr.append('['+','.join([str(L),str(round(w*1000))]+[str(round(c*1000)) for p in mp for c in p])+']')
    img.save(os.path.join(out,cfg['key']+'_'+view+'.png'));res[view]='['+','.join(arr)+']'
    allwrap+=wrap
  json.dump(allwrap,open(os.path.join(os.path.dirname(os.path.abspath(cfgp)),cfg['key']+'.towrap.json'),'w'))
  P=lambda n:"['%s',%s]"%(pal[n][0],pal[n][1])
  N=cfg.get('num');num=("num:{w:%s,o:%s,%snose:'%s',side:'%s',hn:%s,hs:%s},"%(N['w'],N.get('o',0),('i:%s,'%N['i']) if N.get('i') else '',N['nose'],N['side'],N['hn'],N['hs'])) if N else ''
  O=cfg.get('ol');ol=("ol:[%d,%s,'%s',%s],"%(layers.index(O['c'])+1,O['w'],pal[O['col']][0],pal[O['col']][1])) if O else ''
  js=("  '%s':{team:'%s',halo:'%s',base:%s,layers:[%s],%s%s\n    top:%s,\n    side:%s},   // %s\n"%(cfg['color'].upper(),cfg['team'],cfg['halo'],P(cfg['base']),
      ','.join(P(n) for n in layers),ol,num,res['top'],res['side'],cfg.get('src','')))
  open(os.path.join(out,cfg['key']+'.livery.js'),'w').write(js)
  print(cfg['key'],'знаков',len(js),'фигур сверху',len(cfg['top']['shapes']),'сбоку',len(cfg['side']['shapes']))
main()
