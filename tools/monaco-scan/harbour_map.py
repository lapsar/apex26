#!/usr/bin/env python3
"""Карта гавани сверху: снимок (Google z18) + OSM (берег, причалы, волнорезы, марина, бассейн, здания)
+ осевая игры с S через 50 м. Для разметки этапа «Гавань» (v1.16.35+).

    python3 harbour_map.py [lat0 lat1 lon0 lon1] [--z=18] [--out=plans/harbour.png]
"""
import json, math, os, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
FNT = ImageFont.load_default(size=22)
import numpy as np
import osm
from plan import fetch, tile_path, O
HERE = os.path.dirname(os.path.abspath(__file__))
a = [x for x in sys.argv[1:] if not x.startswith('--')]
opt = dict(x[2:].split('=', 1) for x in sys.argv[1:] if x.startswith('--'))
LA0, LA1, LO0, LO1 = map(float, a) if len(a) == 4 else (43.7305, 43.7395, 7.4185, 7.4310)
Z = int(opt.get('z', 18)); SRC = opt.get('src', 'google')
n = 256 * 2 ** Z
def gx(lon): return (lon + 180) / 360 * n
def gy(lat): return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
X0, X1, Y0, Y1 = gx(LO0), gx(LO1), gy(LA1), gy(LA0)
need = [(SRC, Z, X, Y) for X in range(int(X0 // 256), int(X1 // 256) + 1) for Y in range(int(Y0 // 256), int(Y1 // 256) + 1)]
with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, need))
W, H = int(X1 - X0), int(Y1 - Y0)
im = Image.new('RGB', (W, H))
for s, z, X, Y in need:
    try: im.paste(Image.open(tile_path(s, z, X, Y)).convert('RGB'), (int(X * 256 - X0), int(Y * 256 - Y0)))
    except Exception: pass
im = Image.blend(im, Image.new('RGB', im.size, (0, 0, 0)), 0.25)
dr = ImageDraw.Draw(im)
def P(lat, lon): return (gx(lon) - X0, gy(lat) - Y0)
def g2ll(x, z): return (O['lat0'] + z / O['mlat'], O['lon0'] - x / O['mlon'])
D = osm.load(); N, WY, RL = D['nodes'], D['ways'], D['rels']
def poly(ids): return [P(*N[i]) for i in ids if i in N]
for k, w in WY.items():
    t = w['tags']; pts = poly(w['nodes'])
    if len(pts) < 2: continue
    if t.get('natural') == 'coastline': dr.line(pts, fill=(0, 255, 255), width=3)
    elif t.get('man_made') in ('pier', 'breakwater', 'quay'): dr.line(pts, fill=(255, 140, 0), width=2)
    elif t.get('leisure') in ('marina',) : dr.line(pts, fill=(255, 0, 255), width=2)
    elif t.get('leisure') in ('swimming_pool', 'sports_centre'): dr.line(pts, fill=(0, 120, 255), width=2)
    elif 'building' in t: dr.line(pts + pts[:1], fill=(255, 255, 255), width=1)
W_ = json.load(open(os.path.join(HERE, 'wall.json')))
PP, S = W_['P'], W_['S']
dr.line([P(*g2ll(*p)) for p in PP] + [P(*g2ll(*PP[0]))], fill=(255, 40, 40), width=2)
for k in range(len(S)):
    if int(S[k]) // int(opt.get('step', 50)) != int(S[k - 1]) // int(opt.get('step', 50)):
        x, y = P(*g2ll(*PP[k])); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 0)); st = int(opt.get('step', 50)); dr.text((x + 4, y - 10), str(int(S[k]) // st * st), fill=(255, 255, 0), font=FNT)
G = json.load(open(os.path.join(HERE, 'gpg_monaco.json')))
for g in G['grandstands']:
    pts = [P(c['lat'], c['lng']) for c in g['coordinates']]
    dr.line(pts + pts[:1], fill=(0, 255, 0), width=3)
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    dr.text((cx, cy), g['name'].replace('Grandstand ', ''), fill=(0, 255, 0), font=FNT)
out = opt.get('out', os.path.join(HERE, 'plans', 'harbour.png')); os.makedirs(os.path.dirname(out), exist_ok=True)
im.save(out); print(out, im.size, '%.2f м/пкс' % (156543.03 * math.cos(math.radians(LA0)) / 2 ** Z))
