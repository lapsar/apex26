#!/usr/bin/env python3
"""План выезда сверху (24.10.2026): снимок ESRI z19 + кромка (белый), стена игры (красный), карман выезда (жёлтый), дома игры (оранж),
улицы OSM (синий), площади OSM (голубой), трибуны grandprixguides (пурпур), кроны деревьев игры (зелёный) → plans/plan_<имя>.jpg.
    node dump-wall.js && python3 runoff-plan.py ro [радиус_м=110]      # шесть выездов v1.17.1
    python3 runoff-plan.py T7:2417,X:5000 [радиус]                      # любые места по S
"""
import json, math, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); os.chdir(HERE)
import osm, tiles
from PIL import Image, ImageDraw, ImageFont
LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739
def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)
W = json.load(open('wall.json')); P, R, S, HW, WL, WR = W['P'], W['R'], W['S'], W['HW'], W['WL'], W['WR']; M = len(P)
s = open(os.path.join(HERE, '..', '..', 'index.html')).read(); i = s.index('const SCENERY_BAKU'); j = s.index('\n};', i); blk = s[i:j]
BLD = []
for m in re.finditer(r"\{name:[^\n]*?h:([\d.]+)[^\n]*?poly:\[(.*?)\]\}", blk):
    BLD.append([xz(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+),([\d.]+)\]', m.group(2))])
k = blk.index('trees: ['); k2 = blk.index('\n  ],', k)
TR = [(xz(float(a), float(b)), float(r)) for a, b, r in re.findall(r'\[([\d.]+),([\d.]+),0,([\d.]+),[\d.]+\]', blk[k:k2])]
D = osm.load(); N = D['nodes']
ROADS = [(w['tags']['highway'], [xz(*N[n]) for n in w['nodes'] if n in N]) for w in D['ways'].values()
         if w['tags'].get('highway') and w['tags']['highway'] not in ('raceway', 'steps', 'cycleway', 'path')]
SQ = [[xz(*N[n]) for n in w['nodes'] if n in N] for w in D['ways'].values()
      if w['tags'].get('place') == 'square' or 'area:highway' in w['tags'] or (w['tags'].get('highway') == 'pedestrian' and w['tags'].get('area') == 'yes')]
G = json.load(open('gpg_baku.json'))['grandstands']
STD = [(g['name'], [xz(c['lat'], c['lng']) for c in g['coordinates']]) for g in G]
Z = 19; RAD = float(sys.argv[2]) if len(sys.argv) > 2 else 110
def plan(name, Sc, out):
    q = min(range(M), key=lambda t: abs(S[t] - Sc)); cx, cz = P[q]
    la, lo = ll(cx, cz); X, Y = tiles.deg2num(la, lo, Z)
    mpp = 156543.03392 * math.cos(math.radians(la)) / 2 ** Z; rp = RAD / mpp
    x0, y0 = int((X * 256 - rp) // 256), int((Y * 256 - rp) // 256); x1, y1 = int((X * 256 + rp) // 256), int((Y * 256 + rp) // 256)
    im = Image.new('RGB', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            tiles.tile(tx, ty, 'esri', Z); im.paste(Image.open(os.path.join(tiles.TD, 'esri_%d_%d_%d.jpg' % (Z, tx, ty))), ((tx - x0) * 256, (ty - y0) * 256))
    im = Image.blend(im, Image.new('RGB', im.size, 'black'), 0.25)
    def px(p):
        a, b = tiles.deg2num(*ll(*p), Z); return ((a - x0) * 256, (b - y0) * 256)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for b in BLD:
        if len(b) > 2: d.polygon([px(p) for p in b], fill=(255, 200, 120, 70), outline=(255, 170, 60, 255))
    for p in SQ:
        if len(p) > 2: d.polygon([px(t) for t in p], outline=(0, 255, 255, 255))
    for nm, p in STD:
        d.polygon([px(t) for t in p], fill=(255, 0, 255, 90), outline=(255, 0, 255, 255))
        c = px((sum(t[0] for t in p) / len(p), sum(t[1] for t in p) / len(p))); d.text(c, nm, fill=(255, 255, 255, 255))
    for (p, r) in TR:
        c = px(p); rr = r / mpp; d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], outline=(60, 255, 60, 200))
    for h, p in ROADS:
        if len(p) > 1: d.line([px(t) for t in p], fill=(80, 160, 255, 230) if h != 'footway' else (180, 180, 180, 120), width=2 if h != 'footway' else 1)
    for sg, Wa in ((1, WR), (-1, WL)):
        for t in range(M):
            u = (t + 1) % M
            if abs(S[u]-S[t])>10: continue
            if Wa[t] > HW[t] + 2.0 or Wa[u] > HW[u] + 2.0:
                quad = [(P[t][0] + R[t][0] * sg * (HW[t]+1), P[t][1] + R[t][1] * sg * (HW[t]+1)), (P[u][0] + R[u][0] * sg * (HW[u]+1), P[u][1] + R[u][1] * sg * (HW[u]+1)),
                        (P[u][0] + R[u][0] * sg * Wa[u], P[u][1] + R[u][1] * sg * Wa[u]), (P[t][0] + R[t][0] * sg * Wa[t], P[t][1] + R[t][1] * sg * Wa[t])]
                d.polygon([px(q) for q in quad], fill=(255, 255, 0, 110))
    d.line([px(p) for p in P], fill=(255,255,255,160), width=1)
    for sg, Wa, col in ((1, WR, (255, 40, 40, 255)), (-1, WL, (255, 40, 40, 255))):
        e = [px((P[t][0] + R[t][0] * sg * HW[t], P[t][1] + R[t][1] * sg * HW[t])) for t in range(M)]
        w = [px((P[t][0] + R[t][0] * sg * Wa[t], P[t][1] + R[t][1] * sg * Wa[t])) for t in range(M)]
        d.line(e, fill=(255, 255, 255, 200), width=1); d.line(w, fill=col, width=3)
    im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
    c = px((cx, cz)); im = im.crop((int(c[0] - rp), int(c[1] - rp), int(c[0] + rp), int(c[1] + rp))).resize((720, 720))
    dd = ImageDraw.Draw(im); f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    dd.text((8, 6), f'{name} S{Sc}: красный — стена игры, белый — кромка, оранж — дома игры,', fill='yellow', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15))
    dd.text((8, 26), 'синий — улицы OSM, голубой — площади OSM, пурпур — трибуны gpg, зелёный — кроны', fill='yellow', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15))
    dd.text((8, 690), name, fill='yellow', font=f)
    im.save(out, quality=85)
os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
for nm, Sc in [('T1', 220), ('T2', 550), ('T3', 1420), ('T4', 1640), ('T15', 3625), ('T16', 3985)] if sys.argv[1] == 'ro' else [tuple(a.split(':')) for a in sys.argv[1].split(',')]:
    plan(nm, int(Sc), os.path.join(HERE, 'plans', 'plan_%s.jpg' % nm))
