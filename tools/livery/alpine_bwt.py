#!/usr/bin/env python3
"""Alpine (v1.17.45): надпись BWT буквами вместо трёх плиток (v1.17.38) — на понтоне и на заднем крыле.
   python3 tools/livery/alpine_bwt.py tools/livery/alpine.json   (правит json на месте: убирает плитки и заднее крыло, ставит буквы;
   повторный запуск даёт то же); затем livery.py -> wrap.js -> livery.py (как у всех команд). Нужен shapely (pip install shapely).
   Буквы — свой жирный гротеск по форме логотипа (фирменный шрифт не повторяем): B с квадратными чашами, W с вершиной до верха строки, T.
   Понтон: розовые буквы с тёмно-синей каймой (ol, как тень на фото) в коробке mir — читаются с обоих бортов (как HAAS, v1.17.44).
   Заднее крыло (ключ wing, карта «сверху» по настоящему x): синие буквы на розовом — розовое задано полем без букв (shapely),
   нарезанным поперёк размаха на полосы с нахлёстом 4 мм (в фигуре ливреи нет дырок — дырка у буквы стала бы швом)."""
import json,sys,math
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
CFG=sys.argv[1];cfg=json.load(open(CFG))
SV,TV=cfg['side'],cfg['top']
sd=lambda z,y:[round(SV['cx']+(1.80-z)*SV['ppm'],2),round(SV['cy']-(y-0.355)*SV['ppm'],2)]
tp=lambda z,x:[round(TV['cx']+(1.80-z)*TV['ppm'],2),round(TV['cy']-x*TV['ppm'],2)]
P=lambda f,pts:[f(*q) for q in pts]
OLD=('BWT плиткой','плитка «','заднее крыло','BWT на понтоне','BWT на заднем крыле')
SV['shapes']=[s for s in SV['shapes'] if not s.get('note','').startswith(OLD)]
TV['shapes']=[s for s in TV['shapes'] if not s.get('note','').startswith(OLD)]
# ---- шрифт: u — по ходу чтения, v — вверх, в высотах строки
def R(u0,v0,u1,v1):return [(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
def se(cu,cv,ru,rv,a,e=3.0):   # точка суперэллипса (e>2 — «квадратнее»)
  c,s=math.cos(math.radians(a)),math.sin(math.radians(a))
  return (cu+ru*math.copysign(abs(c)**(2/e),c),cv+rv*math.copysign(abs(s)**(2/e),s))
def bowl(cu,o,i,n=14):   # правая чаша B: полукольцо от низа к верху снаружи и обратно внутри; o, i — (v0, v1, ru) внешней и внутренней
  out=[se(cu,(o[0]+o[1])/2,o[2],(o[1]-o[0])/2,-90+180*k/n) for k in range(n+1)]
  inn=[se(cu,(i[0]+i[1])/2,i[2],(i[1]-i[0])/2,90-180*k/n) for k in range(n+1)]
  return out+inn
def glyph(ch):
  if ch=='B':return 0.97,[R(0,0,0.30,1),R(0,0.80,0.55,1),R(0,0.43,0.55,0.58),R(0,0,0.55,0.20),
                          bowl(0.55,(0.43,1.0,0.36),(0.58,0.80,0.12)),bowl(0.55,(0.0,0.58,0.42),(0.20,0.43,0.16))]
  if ch=='W':return 1.47,[[(0,1),(0.31,1),(0.48,0.34),(0.62,1),(0.85,1),(0.99,0.34),(1.16,1),(1.47,1),(1.12,0),(0.88,0),(0.735,0.62),(0.59,0),(0.35,0)]]
  if ch=='T':return 1.18,[R(0,0.78,1.18,1),R(0.43,0,0.75,1)]
def word(txt,h,gap=0.08):
  out=[];u=0
  for ch in txt:
    w,ps=glyph(ch);out.append((ch,[[((u+a)*h,b*h) for a,b in p] for p in ps]));u+=w+gap
  return out,(u-gap)*h
# ---- понтон: на месте плиток v1.17.38 (z 0.24 … −0.46, y 0.40–0.57), B — к носу (фото сбоку — левый борт)
H1,Y1,Z1=0.17,0.405,0.235
W1,L1=word('BWT',H1)
for ch,ps in W1:
  for p in ps:SV['shapes'].append({"c":"bwt","note":"BWT на понтоне — "+ch,"p":P(sd,[(Z1-u,Y1+v) for u,v in p])})
cfg['mir']=[[round(Z1-L1-0.06,3),round(Z1+0.06,3),0.40,0.596,0.9]]
# ---- заднее крыло (ключ wing, как у Haas v1.17.44): z −1.74…−2.40, x −0.56…+0.56 — v=(x+WHW)/(2 WHW); перед ним (z −1.675…−1.74) — розовая кромка обычной картой
WZ0,WZ1,WHW=-2.40,-1.74,0.56
cfg['wing']=[WZ0,WZ1,WHW]
wv=lambda z,x:tp(z,(x+WHW)/(2*WHW))
TV['shapes'].append({"c":"pink","note":"заднее крыло: передняя кромка перед полосой wing — розовая","p":P(tp,[(-1.675,0.0),(-1.675,0.625),(WZ1,0.625),(WZ1,0.0)])})
TV['shapes'].append({"c":"blue","note":"заднее крыло: синее под розовым — буквы BWT","p":P(wv,[(WZ1,-WHW),(WZ1,WHW),(WZ0,WHW),(WZ0,-WHW)])})
H3,B3=0.25,-1.88   # строка: низ букв у передней кромки, верх — к корме, до щели закрылка (z −2.19); читается от −x к +x (как на фото сверху)
W3,L3=word('BWT',H3)
letters=unary_union([Polygon([(B3-v,u-L3/2) for u,v in p]).buffer(0) for ch,ps in W3 for p in ps])
pink=box(WZ0,-WHW,WZ1,WHW).difference(letters)
xs=sorted({round(x,3) for g in getattr(letters,'geoms',[letters]) for x in g.exterior.xy[1]}|{-WHW,WHW})
cut=[xs[0]]
for x in xs[1:]:
  if x-cut[-1]>=0.012:cut.append(x)
cut[-1]=WHW;E=0.004;n=0
for a,b in zip(cut,cut[1:]):
  piece=pink.intersection(box(WZ0,max(-WHW,a-E),WZ1,min(WHW,b+E)))
  for g in getattr(piece,'geoms',[piece]):
    if g.geom_type!='Polygon' or g.area<1e-6:continue
    assert not g.interiors,(a,b)
    g=g.simplify(0.0005);TV['shapes'].append({"c":"pink","note":"заднее крыло: розовое вокруг букв BWT (полоса x %.3f…%.3f)"%(a,b),"p":P(wv,list(g.exterior.coords)[:-1])});n+=1
cfg['src']=cfg['src'].replace('BWT — тремя розовыми плитками с тёмно-синей каймой','BWT — буквами: розовые с тёмно-синей каймой на понтоне, синие на розовом заднем крыле (v1.17.45; до неё — плитки)')
cfg['ol']['note']='тёмно-синяя кайма букв BWT 1.5 см — как тень букв на фото; щели между буквами и просветы B кайма заливает (на фото там тоже тёмно-синее)'
s=json.dumps(cfg,ensure_ascii=False).replace('{"c"','\n   {"c"')
open(CFG,'w').write(s)
print('BWT на понтоне %.3f м, на крыле %.3f м; розовых полос на крыле %d; mir'%(L1,L3,n),cfg['mir'])
