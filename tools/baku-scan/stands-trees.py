#!/usr/bin/env python3
"""Трибуны grandprixguides (gpg_baku.json, 19) против деревьев и домов игры (24.10.2026, без правки игры): S, сторона, отступ от стены,
деревья в следе и между следом и стеной, дома в следе. Игра сама не ставит дерево в след трибуны ОТ СТЕНЫ (standFootprints(true));
дома — city.py по ST из wall.json (после трибун: node dump-wall.js && python3 city.py).
    node dump-wall.js && python3 stands-trees.py
"""
import json, math, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); os.chdir(HERE)
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739
def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
W = json.load(open('wall.json')); P, R, S, HW, WL, WR = W['P'], W['R'], W['S'], W['HW'], W['WL'], W['WR']; M = len(P)
s = open(os.path.join(HERE, '..', '..', 'index.html')).read(); i = s.index('const SCENERY_BAKU'); j = s.index('\n};', i); blk = s[i:j]
G = []
for m in re.finditer(r"\{name:([^\n]*?),[^\n]*?h:([\d.]+)[^\n]*?poly:\[(.*?)\]\}", blk):
    pts = [xz(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+),([\d.]+)\]', m.group(3))]
    if len(pts) >= 3: G.append((m.group(1)[:30], Polygon(pts).buffer(0)))
k = blk.index('trees: ['); k2 = blk.index('\n  ],', k)
TR = [(xz(float(a), float(b)), float(r)) for a, b, r in re.findall(r'\[([\d.]+),([\d.]+),0,([\d.]+),[\d.]+\]', blk[k:k2])]
tot = 0
for g in json.load(open('gpg_baku.json'))['grandstands']:
    pts = [xz(c['lat'], c['lng']) for c in g['coordinates']]; poly = Polygon(pts).buffer(0)
    c = poly.centroid; q = min(range(M), key=lambda t: (P[t][0] - c.x) ** 2 + (P[t][1] - c.y) ** 2)
    side = (c.x - P[q][0]) * R[q][0] + (c.y - P[q][1]) * R[q][1]; sg = 1 if side > 0 else -1; Wa = WR if sg > 0 else WL
    # ближайший край трибуны до стены
    near = min(math.hypot(x - P[q][0], z - P[q][1]) for x, z in pts)
    dwall = poly.exterior.distance(Point(P[q])) - Wa[q]
    inside = poly.distance(Point(P[q])) == 0
    # «от стены»: полоса между стеной и трибуной тоже
    hull = unary_union([poly, Polygon([(P[q][0] + R[q][0] * sg * Wa[q], P[q][1] + R[q][1] * sg * Wa[q])] + list(poly.exterior.coords)).convex_hull])
    nt = sum(1 for p, r in TR if poly.contains(Point(p))); nh = sum(1 for p, r in TR if hull.contains(Point(p)) and not poly.contains(Point(p)))
    bl = [(n, poly.intersection(b).area) for n, b in G if poly.intersects(b) and poly.intersection(b).area > 5]
    tot += nt
    print(f"{g['name'][:28]:28s} S{S[q]:5.0f} {'R' if sg>0 else 'L'}  {poly.area:5.0f} м²  от стены {dwall:6.1f} м {'НА ТРАССЕ' if inside else ''}  деревьев в следе {nt:3d}, между ним и стеной {nh:3d};  дома: {', '.join('%s %.0f м²' % b for b in bl) or '—'}")
print('всего деревьев в следах', tot)
