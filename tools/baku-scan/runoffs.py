#!/usr/bin/env python3
"""Выезды Баку против города (24.10.2026, вопрос владельца «выезды — продолжения улиц?», без правки игры).
Для каждого выезда (wallOut, v1.17.1): карман между обычной стеной (кромка + 1 м) и построенной; деревья в нём; что за стеной
(дома игры, улицы и площади OSM); сколько кармана лежит в ИСХОДНЫХ домах OSM (city.py их подрезал по коридору — в игре не видно).
    node dump-wall.js && python3 runoffs.py
План сверху — runoff-plan.py, трибуны против деревьев — stands-trees.py.
"""
import json, math, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739
def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, R, S, HW, WL, WR = W['P'], W['R'], W['S'], W['HW'], W['WL'], W['WR']
M = len(P)
s = open(os.path.join(HERE, '..', '..', 'index.html')).read(); i = s.index('const SCENERY_BAKU'); j = s.index('\n};', i); blk = s[i:j]
G = []
for m in re.finditer(r"\{name:[^\n]*?h:([\d.]+)[^\n]*?poly:\[(.*?)\]\}", blk):
    pts = [xz(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+),([\d.]+)\]', m.group(2))]
    if len(pts) >= 3:
        g = Polygon(pts).buffer(0)
        if not g.is_empty: G.append(g)
BU = unary_union(G); BT = STRtree(G)
k = blk.index('trees: ['); k2 = blk.index('\n  ],', k)
TR = [(xz(float(a), float(b)), float(r)) for a, b, r in re.findall(r'\[([\d.]+),([\d.]+),0,([\d.]+),[\d.]+\]', blk[k:k2])]
D = osm.load(); N = D['nodes']
AREAS = []
for wid, w in D['ways'].items():
    t = w['tags']; kind = None
    if t.get('highway') in ('pedestrian',) and t.get('area') == 'yes' or 'area:highway' in t or t.get('place') == 'square': kind = 'площадь/пешеходная'
    elif t.get('amenity') == 'parking': kind = 'парковка'
    elif t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'forest'): kind = 'зелень'
    if kind and w['nodes'][0] == w['nodes'][-1]:
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        if len(pts) >= 4:
            g = Polygon(pts).buffer(0)
            if not g.is_empty: AREAS.append((kind, t.get('name', ''), g))
ROADS = []
for wid, w in D['ways'].items():
    h = w['tags'].get('highway')
    if h and h not in ('raceway', 'footway', 'steps', 'cycleway', 'path'):
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        if len(pts) >= 2: ROADS.append((h, w['tags'].get('name:ru') or w['tags'].get('name', ''), LineString(pts)))
def st(Sv): return min(range(M), key=lambda q: abs(S[q] - Sv))
def ray(o, d, L=200):
    ln = LineString([o, (o[0] + d[0] * L, o[1] + d[1] * L)])
    best = L
    for n in BT.query(ln):
        x = G[n].intersection(ln)
        if not x.is_empty: best = min(best, Point(o).distance(x))
    return best
OUT = [('T1', 'R', 14, 160, 262), ('T2', 'R', 10, 505, 590), ('T3', 'R', 8, 1385, 1455), ('T4', 'L', 10, 1600, 1680),
       ('T15', 'R', 10, 3585, 3665), ('T16', 'R', 16, 3935, 4032)]
for n, side, by, a, b in OUT:
    sg = 1 if side == 'R' else -1; Wa = WR if side == 'R' else WL
    ia, ib = st(a), st(b)
    # карман: полоса между обычной стеной (HW+1) и построенной
    L1, L2 = [], []
    for q in range(ia, ib + 1):
        w0 = HW[q] + 1.0; w = Wa[q]
        L1.append((P[q][0] + R[q][0] * sg * w0, P[q][1] + R[q][1] * sg * w0)); L2.append((P[q][0] + R[q][0] * sg * w, P[q][1] + R[q][1] * sg * w))
    pocket = Polygon(L1 + L2[::-1]).buffer(0)
    wmax = max(Wa[q] - HW[q] for q in range(ia, ib + 1))
    # за построенной стеной: свободно до дома (по нормали), середина участка
    beyond = []
    for q in range(ia, ib + 1, 3):
        o = L2[q - ia]; beyond.append(ray(o, (R[q][0] * sg, R[q][1] * sg)))
    beyond.sort()
    # прямо по ходу из точки торможения (начало участка): до первого дома
    q0 = max(0, ia - 15); d = (P[q0 + 1][0] - P[q0][0], P[q0 + 1][1] - P[q0][1]); dl = math.hypot(*d); d = (d[0] / dl, d[1] / dl)
    straight = ray(P[q0], d, 400)
    ntr = sum(1 for (p, r) in TR if pocket.distance(Point(p)) < 0.01)
    # что за стеной: полоса 30 м за построенной стеной
    band = Polygon(L2 + [(P[q][0] + R[q][0] * sg * (Wa[q] + 30), P[q][1] + R[q][1] * sg * (Wa[q] + 30)) for q in range(ib, ia - 1, -1)]).buffer(0)
    bfree = band.difference(BU).area / band.area
    ntb = sum(1 for (p, r) in TR if band.distance(Point(p)) < 0.01)
    ar = sorted({(k_, nm) for k_, nm, g in AREAS if g.intersects(band) and g.intersection(band).area > 30})
    rd = sorted({(h, nm) for h, nm, g in ROADS if g.intersects(band)})
    print(f'{n} S{a}-{b} {side}: карман до +{wmax:.1f} м за кромкой, {pocket.area:.0f} м², деревьев в кармане {ntr}; '
          f'за стеной до дома (по нормали) мин/мед/макс {beyond[0]:.0f}/{beyond[len(beyond)//2]:.0f}/{beyond[-1]:.0f} м; '
          f'прямо по ходу от S{S[q0]:.0f} до дома {straight:.0f} м; полоса 30 м за стеной: без домов {bfree*100:.0f} %, деревьев {ntb}')
    print('   площади/зелень:', ar)
    print('   улицы:', rd)
print('--- карман против ИСХОДНЫХ домов OSM')
OB = []
for w in D['ways'].values():
    if 'building' in w['tags'] and w['nodes'][0] == w['nodes'][-1]:
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        if len(pts) >= 4:
            g = Polygon(pts).buffer(0)
            if not g.is_empty: OB.append((w['tags'].get('name', ''), g))
for n, side, by, a, b in OUT:
    sg = 1 if side == 'R' else -1; Wa = WR if side == 'R' else WL; ia, ib = st(a), st(b)
    L1 = [(P[q][0] + R[q][0] * sg * (HW[q] + 1), P[q][1] + R[q][1] * sg * (HW[q] + 1)) for q in range(ia, ib + 1)]
    L2 = [(P[q][0] + R[q][0] * sg * Wa[q], P[q][1] + R[q][1] * sg * Wa[q]) for q in range(ia, ib + 1)]
    pk = Polygon(L1 + L2[::-1]).buffer(0)
    hit = [(nm, pk.intersection(g).area) for nm, g in OB if pk.intersects(g) and pk.intersection(g).area > 1]
    print(n, 'карман %.0f м², в домах OSM %.0f м²' % (pk.area, sum(h[1] for h in hit)), hit)
