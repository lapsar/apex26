#!/usr/bin/env python3
"""План кармана выезда для разметки (v1.17.9): снимок ESRI z19, сетка координат игры (x, z) через 10 м, кромка (белый) со стрелками
хода и S через 10 м, стена игры (красный), дома OSM ИСХОДНЫЕ (оранж, до подрезки city.py), асфальт улиц земли города (синий),
карман из pockets.py (голубой, точки подписаны) → plans/pk_<имя>.jpg.
    node dump-wall.js && python3 pocket-plan.py [T2,T4 | все] [радиус_м=70]
"""
import json, math, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); os.chdir(HERE)
import osm, tiles, pockets
from PIL import Image, ImageDraw, ImageFont
LAT0, LON0, MLON = pockets.LAT0, pockets.LON0, pockets.MLON
xz, ll = pockets.xz, pockets.ll
W = json.load(open('wall.json')); P, R, S, HW, WL, WR = W['P'], W['R'], W['S'], W['HW'], W['WL'], W['WR']; M = len(P)
GAPS = W.get('GAPS', [])
s = open(os.path.join(HERE, '..', '..', 'index.html')).read(); i = s.index('const SCENERY_BAKU'); j = s.index('\n};', i); blk = s[i:j]
ASPH = []
k = blk.find('    asphalt: [')
if k > 0:
    k2 = blk.index('\n    ],', k)
    for ring in re.findall(r'\[\[([\d.,]+)\]', blk[k:k2]):
        v = [float(t) for t in ring.split(',')]; ASPH.append([xz(v[q], v[q + 1]) for q in range(0, len(v), 2)])
D = osm.load(); N = D['nodes']
OB = [[xz(*N[n]) for n in w['nodes'] if n in N] for w in D['ways'].values() if 'building' in w['tags']]
ROADS = [(w['tags']['highway'], w['tags'].get('name:ru') or w['tags'].get('name', ''), [xz(*N[n]) for n in w['nodes'] if n in N]) for w in D['ways'].values()
         if w['tags'].get('highway') and w['tags']['highway'] not in ('raceway', 'steps', 'cycleway', 'path', 'footway')]
SRC = os.environ.get('PLAN_SRC', 'esri')   # v1.17.12: PLAN_SRC=wb15423 — Wayback, снимок 16.05.2021 (боксы стоят)
PIT = [[xz(*N[n]) for n in D['ways'][ref]['nodes'] if n in N] for t, ref, role in D['rels']['11266687']['members'] if role == 'pit_lane' and ref in D['ways']]
Z = 19; RAD = float(sys.argv[2]) if len(sys.argv) > 2 else 70; OUTPX = 1000
F = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)


def plan(name, Sc, pk, out):
    q = min(range(M), key=lambda t: abs(S[t] - Sc)); cx, cz = P[q]
    la, lo = ll(cx, cz); X, Y = tiles.deg2num(la, lo, Z)
    mpp = 156543.03392 * math.cos(math.radians(la)) / 2 ** Z; rp = RAD / mpp
    x0, y0 = int((X * 256 - rp) // 256), int((Y * 256 - rp) // 256); x1, y1 = int((X * 256 + rp) // 256), int((Y * 256 + rp) // 256)
    im = Image.new('RGB', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            tiles.tile(tx, ty, SRC, Z); im.paste(Image.open(os.path.join(tiles.TD, '%s_%d_%d_%d.jpg' % (SRC, Z, tx, ty))), ((tx - x0) * 256, (ty - y0) * 256))
    im = Image.blend(im, Image.new('RGB', im.size, 'black'), 0.2)
    c0 = (X * 256 - x0 * 256 - rp, Y * 256 - y0 * 256 - rp); sc = OUTPX / (2 * rp)
    im = im.crop((int(c0[0]), int(c0[1]), int(c0[0] + 2 * rp), int(c0[1] + 2 * rp))).resize((OUTPX, OUTPX))
    ox, oy = int(c0[0]), int(c0[1])
    def px(p):
        a, b = tiles.deg2num(*ll(*p), Z); return (((a - x0) * 256 - ox) * sc, ((b - y0) * 256 - oy) * sc)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for g in range(int((cx - RAD) // 10) * 10, int(cx + RAD) + 10, 10):      # сетка x (на запад растёт)
        d.line([px((g, cz - RAD * 1.5)), px((g, cz + RAD * 1.5))], fill=(255, 255, 255, 50 if g % 50 else 110), width=1)
    for g in range(int((cz - RAD) // 10) * 10, int(cz + RAD) + 10, 10):
        d.line([px((cx - RAD * 1.5, g)), px((cx + RAD * 1.5, g))], fill=(255, 255, 255, 50 if g % 50 else 110), width=1)
    for a in ASPH:
        if len(a) > 2: d.polygon([px(t) for t in a], fill=(60, 120, 255, 45))
    for b in OB:
        if len(b) > 2: d.polygon([px(p) for p in b], fill=(255, 190, 110, 60), outline=(255, 160, 50, 255))
    for p in PIT:                                                            # пит-лейн OSM (роль pit_lane, v1.17.12) — пурпур
        d.line([px(t) for t in p], fill=(255, 0, 255, 230), width=3)
    for h, nm, p in ROADS:
        if len(p) > 1: d.line([px(t) for t in p], fill=(90, 170, 255, 200), width=1)
    for sg, Wa in ((1, WR), (-1, WL)):
        e = [px((P[t][0] + R[t][0] * sg * HW[t], P[t][1] + R[t][1] * sg * HW[t])) for t in range(M)]
        d.line(e, fill=(255, 255, 255, 230), width=2)
        n1 = [px((P[t][0] + R[t][0] * sg * (HW[t] + 1), P[t][1] + R[t][1] * sg * (HW[t] + 1))) for t in range(M)]
        for t in range(0, M - 1, 2): d.line([n1[t], n1[t + 1]], fill=(255, 120, 255, 200), width=1)
        V = W['VR'] if sg > 0 else W['VL']
        for t in range(M):
            u = (t + 1) % M
            if V and (not V[t] or not V[u]): continue
            d.line([px((P[t][0] + R[t][0] * sg * Wa[t], P[t][1] + R[t][1] * sg * Wa[t])), px((P[u][0] + R[u][0] * sg * Wa[u], P[u][1] + R[u][1] * sg * Wa[u]))], fill=(255, 40, 40, 255), width=3)
    for g in GAPS:
        d.line([px(t) for t in g['path']], fill=(255, 40, 40, 255), width=3)
    done = set()
    for t in range(M):
        if abs(S[t] - Sc) > RAD * 1.6: continue
        m10 = int(round(S[t] / 10) * 10)
        if m10 in done or abs(S[t] - m10) > 2.1: continue
        done.add(m10); a = px(P[t]); d.ellipse([a[0] - 3, a[1] - 3, a[0] + 3, a[1] + 3], fill=(255, 255, 0, 255))
        if m10 % 20 == 0: d.text((a[0] + 5, a[1] - 7), str(m10), fill=(255, 255, 0, 255), font=F(13))
        if m10 % 30 == 0:
            u = (t + 2) % M; b = px(P[u]); L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L; tip = (a[0] + ux * 26, a[1] + uy * 26)
            d.line([a, tip], fill=(255, 255, 0, 255), width=3)
            d.polygon([tip, (tip[0] - ux * 9 - uy * 6, tip[1] - uy * 9 + ux * 6), (tip[0] - ux * 9 + uy * 6, tip[1] - uy * 9 - ux * 6)], fill=(255, 255, 0, 255))
    if pk:
        pts = list(pk['path'])
        d.line([px(p) for p in pts], fill=(0, 255, 255, 255), width=3)
        for n, p in enumerate(pts):
            a = px(p); d.ellipse([a[0] - 4, a[1] - 4, a[0] + 4, a[1] + 4], fill=(0, 255, 255, 255)); d.text((a[0] + 6, a[1] + 2), str(n), fill=(0, 255, 255, 255), font=F(14))
    im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB'); dd = ImageDraw.Draw(im)
    for g in range(int((cx - RAD) // 10) * 10, int(cx + RAD) + 10, 10):
        a = px((g, cz));
        if 0 < a[0] < OUTPX: dd.text((a[0] + 2, OUTPX - 18), 'x%d' % g, fill='white', font=F(11))
    for g in range(int((cz - RAD) // 10) * 10, int(cz + RAD) + 10, 10):
        a = px((cx, g))
        if 0 < a[1] < OUTPX: dd.text((2, a[1] + 1), 'z%d' % g, fill='white', font=F(11))
    dd.text((8, 6), f'{name} S{Sc}: белый — кромка, жёлтый — ход и S, красный — стена, оранж — дома OSM, синий — асфальт улиц, голубой — карман',
            fill='yellow', font=F(14))
    im.save(out, quality=88)
    json.dump(dict(x0=x0, y0=y0, ox=ox, oy=oy, sc=sc), open(out[:-4] + '.json', 'w'))


def px2xz(name, u, v):
    """пиксель плана plans/pk_<имя>.jpg → координаты игры (x, z)"""
    t = json.load(open(os.path.join(HERE, 'plans', 'pk_%s.json' % name)))
    a, b = (u / t['sc'] + t['ox']) / 256 + t['x0'], (v / t['sc'] + t['oy']) / 256 + t['y0']
    n = 2 ** Z; lon = a / n * 360 - 180; lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * b / n))))
    return xz(lat, lon)


if __name__ == '__main__':
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    want = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] != 'все' else [p['corner'] for p in pockets.POCKETS]
    for p in pockets.POCKETS:
        if p['corner'] in want:
            plan(p['corner'], p['at'], p if p.get('path') else None, os.path.join(HERE, 'plans', 'pk_%s.jpg' % p['corner'])); print('plans/pk_%s.jpg' % p['corner'])
