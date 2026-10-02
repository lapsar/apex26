#!/usr/bin/env python3
"""Снимок сверху вокруг точки контура с наложением: контур mc-1929 (красный, метки S
через 50 м), оси улиц трассы OSM (голубой; тоннель — жёлтый), узел start-finish OSM
(пурпурный), сетка 10 м (тонкая). Смотреть глазами.

    python3 view.py S [радиус_м=90] [--src=esri|google] [--z=19|20] [--out=файл.png] [--extra=файл.tsv]
--extra=файл[:RRGGBB], --extra2=…: точки x y (метры mc) — дорисовать (по умолчанию зелёным).
"""
import math, os, sys, urllib.request
from PIL import Image, ImageDraw
import mc, osm
HERE = os.path.dirname(os.path.abspath(__file__))
TD = os.path.join(HERE, 'tiles'); os.makedirs(TD, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
S0 = float(args[0]); RAD = float(args[1]) if len(args) > 1 else 90
SRC = opt.get('src', 'google'); Z = int(opt.get('z', 20))


def deg2num(lat, lon, z):
    n = 2 ** z; la = math.radians(lat)
    return ((lon + 180) / 360 * n, (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n)


def tile(X, Y):
    fn = os.path.join(TD, '%s_%d_%d_%d.jpg' % (SRC, Z, X, Y))
    if not os.path.exists(fn):
        url = (f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{Y}/{X}'
               if SRC == 'esri' else f'https://mt1.google.com/vt/lyrs=s&x={X}&y={Y}&z={Z}')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        open(fn, 'wb').write(urllib.request.urlopen(req, timeout=45).read())
    return Image.open(fn).convert('RGB')


c, _ = mc.at(S0)
la0, lo0 = mc.latlon(c[0] - RAD, c[1] + RAD); la1, lo1 = mc.latlon(c[0] + RAD, c[1] - RAD)
x0, y0 = deg2num(la0, lo0, Z); x1, y1 = deg2num(la1, lo1, Z)
X0, Y0, X1, Y1 = int(x0), int(y0), int(x1), int(y1)
im = Image.new('RGB', ((X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256))
for X in range(X0, X1 + 1):
    for Y in range(Y0, Y1 + 1):
        im.paste(tile(X, Y), ((X - X0) * 256, (Y - Y0) * 256))
im = im.crop((int((x0 - X0) * 256), int((y0 - Y0) * 256), int((x1 - X0) * 256), int((y1 - Y0) * 256)))
ox, oy = (x0 - X0) * 256 + X0 * 256, (y0 - Y0) * 256 + Y0 * 256


def P(x, y):
    la, lo = mc.latlon(x, y); u, v = deg2num(la, lo, Z)
    return (u * 256 - ox, v * 256 - oy)


d = ImageDraw.Draw(im)
for k in range(-int(RAD // 10), int(RAD // 10) + 1):          # сетка 10 м (по осям x/y)
    d.line([P(c[0] + k * 10, c[1] - RAD), P(c[0] + k * 10, c[1] + RAD)], fill=(255, 255, 255), width=1)
    d.line([P(c[0] - RAD, c[1] + k * 10), P(c[0] + RAD, c[1] + k * 10)], fill=(255, 255, 255), width=1)
D = osm.load()
for t, ref, role in D['rels']['148194']['members']:
    if t != 'way': continue
    w = D['ways'][ref]; col = (255, 230, 0) if w['tags'].get('tunnel') == 'yes' else ((120, 120, 255) if role == 'pit_lane' or 'stands' in w['tags'].get('name', '') else (0, 230, 255))
    d.line([P(*mc.xy(*D['nodes'][n])) for n in w['nodes']], fill=col, width=3)
sf = mc.xy(*D['nodes']['4937755860']); q = P(*sf); d.ellipse([q[0] - 7, q[1] - 7, q[0] + 7, q[1] + 7], outline=(255, 0, 255), width=3)
pts = [P(*p) for p in mc.R]; d.line(pts + [pts[0]], fill=(255, 40, 40), width=2)
S = 0
while S < mc.TOT:
    p, _ = mc.at(S); q = P(*p)
    if abs(p[0] - c[0]) < RAD and abs(p[1] - c[1]) < RAD:
        d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], fill=(255, 40, 40)); d.text((q[0] + 5, q[1] - 6), '%d' % S, fill=(255, 255, 0))
    S += 50
for spec in [v for k, v in opt.items() if k.startswith('extra')]:
    fn, _, colr = spec.partition(':'); col = tuple(int(colr[i:i + 2], 16) for i in (0, 2, 4)) if colr else (60, 255, 60)
    for l in open(fn):
        if not l.strip() or l.startswith('#'): continue
        q = P(*map(float, l.split()[:2])); d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], fill=col)
out = opt.get('out', os.path.join(HERE, 'views', 'S%04d.png' % S0)); os.makedirs(os.path.dirname(out), exist_ok=True)
im.save(out); print(out, im.size)
