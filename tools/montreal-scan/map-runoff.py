#!/usr/bin/env python3
"""Карта вида сверху: полотно, отбойник и размеченные асфальтовые зоны.
Координаты игры ОТРАЖЕНЫ ПО X (§7, ловушка №1) — здесь отражение снято,
чтобы картинку можно было положить рядом с настоящей схемой трассы."""
import json, os, sys
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__))
cl=json.load(open(os.path.join(HERE,'centerline.json')))
w=json.load(open(os.path.join(HERE,'wall.json')))
sf=json.load(open(os.path.join(HERE,'surface.json')))
P,R,S=cl['P'],cl['R'],cl['S'];M=len(P)
zones=json.loads(sys.argv[1]) if len(sys.argv)>1 else []
xs=[-p[0] for p in P];zs=[p[1] for p in P]
pad=60;sc=1600/max(max(xs)-min(xs),max(zs)-min(zs))
W=int((max(xs)-min(xs))*sc)+2*pad;H=int((max(zs)-min(zs))*sc)+2*pad
im=Image.new('RGB',(W,H),(30,60,30));d=ImageDraw.Draw(im)
def pt(x,z):return (pad+(-x-min(xs))*sc, H-pad-(z-min(zs))*sc)
def band(i,a,b,sgn):
    p1=pt(P[i][0]+R[i][0]*sgn*a,P[i][1]+R[i][1]*sgn*a)
    p2=pt(P[i][0]+R[i][0]*sgn*b,P[i][1]+R[i][1]*sgn*b)
    return p1,p2
for i in range(M):
    j=(i+1)%M
    a=band(i,-7,7,1);b=band(j,-7,7,1)
    d.polygon([a[0],a[1],b[1],b[0]],fill=(60,60,66))
for i in range(M):
    for sgn,key in ((-1,'WL'),(1,'WR')):
        o=w[key][i];p=pt(P[i][0]+R[i][0]*sgn*o,P[i][1]+R[i][1]*sgn*o)
        d.ellipse([p[0]-1,p[1]-1,p[0]+1,p[1]+1],fill=(220,220,220))
for z in zones:
    sgn=-1 if z['side']=='L' else 1
    ia=min(range(M),key=lambda k:abs(S[k]-z['fromS']));ib=min(range(M),key=lambda k:abs(S[k]-z['toS']))
    span=(ib-ia+M)%M
    for t in range(span):
        i=(ia+t)%M;j=(i+1)%M
        o1=w['WL'][i] if sgn<0 else w['WR'][i]; o2=w['WL'][j] if sgn<0 else w['WR'][j]
        a=band(i,7.85,o1-0.3,sgn);b=band(j,7.85,o2-0.3,sgn)
        d.polygon([a[0],a[1],b[1],b[0]],fill=(150,150,158))
for s,lbl in ((0,'START'),(2700,'EPINGLE'),(3900,'CHICANE')):
    i=min(range(M),key=lambda k:abs(S[k]-s));p=pt(*P[i])
    d.text((p[0]+6,p[1]-6),lbl,fill=(255,220,0))
im.save(os.path.join(HERE,'runoff_map.png'));print('runoff_map.png',W,'x',H)
