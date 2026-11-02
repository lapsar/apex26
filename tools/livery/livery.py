#!/usr/bin/env python3
"""Ливрея команды из фото -> карты «сверху» и «сбоку» для index.html (LIVERY, v1.17.32).
   python3 -I tools/livery/livery.py tools/livery/<команда>.json [--out DIR]
Фото сверху и сбоку совмещаются с болидом по центрам колёс (калибровка вида в json: ppm — пикселей на метр,
cx, cy — пиксель центра переднего колеса; модель W17: оси z +1.80 / −1.60, колесо R 0.355). Для каждого вида:
  1) paint — многоугольники цветом RGB прямо по фото (закрасить надписи и логотипы цветом под ними);
  2) classes — пиксель фото -> цвет палитры по правилам (по порядку, первое совпавшее; иначе default),
     только внутри auto (если задан; вне — default);
  3) shapes — фигуры цветом палитры поверх (чистые края там, где фото тёмное или в бликах): p — многоугольник,
     line + w — линия толщиной w пикселей фото;
  4) карта 512×128 — большинство по окну вокруг точки текселя.
Пиксели всех фигур — пиксели исходного фото. Выход: <key>.livery.js — готовая строка для LIVERY в index.html (заменить строку команды целиком)
и <key>_top/side.png — карты для проверки глазом.
Сетка карт — как в игре: z от LIV_Z0 до LIV_Z1, сверху |x| до LIV_X, сбоку y до LIV_Y."""
import sys,json,os
import numpy as np
from PIL import Image,ImageDraw
LIV_Z0,LIV_Z1,LIV_X,LIV_Y,W,H=-2.45,3.25,1.0,1.28,512,128
A='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
def build(cfg,view,base,names):
  V=cfg[view];im=Image.open(os.path.join(base,V['photo'])).convert('RGB');dr=ImageDraw.Draw(im)
  for p in V.get('paint',[]):dr.polygon([tuple(q) for q in p['p']],fill=tuple(p['rgb']))
  a=np.asarray(im).astype(np.float32);r,g,b=a[...,0],a[...,1],a[...,2]
  env=dict(r=r,g=g,b=b,L=(r+g+b)/3,sat=a.max(-1)-a.min(-1))
  idx={n:i for i,n in enumerate(names)};C=np.full(r.shape,idx[cfg['default']],np.uint8);done=np.zeros(r.shape,bool)
  for rule,name in V.get('classes',cfg.get('classes',[])):
    m=eval(rule,{'__builtins__':{}},env)&~done;C[m]=idx[name];done|=m
  if 'auto' in V:
    mk=Image.new('L',im.size,0);d=ImageDraw.Draw(mk)
    for p in V['auto']:d.polygon([tuple(q) for q in p],fill=1)
    C[np.asarray(mk)==0]=idx[cfg['default']]
  ci=Image.fromarray(C);d=ImageDraw.Draw(ci)
  for s in V.get('shapes',[]):
    if 'line' in s:d.line([tuple(q) for q in s['line']],fill=idx[s['c']],width=s.get('w',8),joint='curve')
    else:d.polygon([tuple(q) for q in s['p']],fill=idx[s['c']])
  C=np.asarray(ci);PH,PW=C.shape;ppm,cx,cy=V['ppm'],V['cx'],V['cy']
  zz=LIV_Z0+(np.arange(W)+0.5)/W*(LIV_Z1-LIV_Z0);X=cx+(1.80-zz)*ppm
  if view=='top':vv=(np.arange(H)+0.5)/H*LIV_X;Y=cy+vv*ppm
  else:vv=(np.arange(H)+0.5)/H*LIV_Y;Y=cy-(vv-0.355)*ppm
  XX,YY=np.meshgrid(X,Y);votes=np.zeros((len(names),H,W),np.int32);st=ppm*0.004
  for dx in (-1,0,1):
    for dy in (-1,0,1):
      xi=np.clip((XX+dx*st).astype(int),0,PW-1);yi=np.clip((YY+dy*st).astype(int),0,PH-1);s=C[yi,xi]
      for k in range(len(names)):votes[k]+=(s==k)
  return votes.argmax(0)
def rle(grid):
  rows=[];prev=None
  for row in grid:
    s='';i=0
    while i<W:
      j=i
      while j<W and row[j]==row[i]:j+=1
      s+=A[row[i]]+(str(j-i) if j-i>1 else '');i=j
    rows.append('=' if s==prev else s);prev=s
  return '|'.join(rows)
def main():
  cfgp=sys.argv[1];out=sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else os.path.dirname(cfgp)
  cfg=json.load(open(cfgp));base=os.path.dirname(os.path.abspath(cfgp));pal=cfg['palette'];names=list(pal);res={}
  rgb=np.array([[int(pal[n][0][i:i+2],16) for i in (1,3,5)] for n in names],np.uint8)
  for view in ('top','side'):
    grid=build(cfg,view,base,names);res[view]=rle(grid)
    Image.fromarray(rgb[grid]).resize((W*2,H*2),Image.NEAREST).save(os.path.join(out,cfg['key']+'_'+view+'.png'))
  js=("  '%s':{team:'%s',halo:'%s',pal:["%(cfg['color'].upper(),cfg['team'],cfg['halo'])+",".join("['%s',%s]"%(pal[n][0],pal[n][1]) for n in names)
      +"],top:'"+res['top']+"',side:'"+res['side']+"'},   // "+cfg.get('src',''))
  open(os.path.join(out,cfg['key']+'.livery.js'),'w').write(js)
  print(cfg['key'],'top',len(res['top']),'side',len(res['side']),'chars')
main()
