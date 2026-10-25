#!/usr/bin/env python3
"""Трибуны Баку по кругу (v1.17.13, владелец 25.10.2026: «далее можно добавить остальные трибуны по всему кругу»). Источник места —
полигоны grandprixguides (gpg_baku.json); каждая трибуна ставится по ПЕРЕДНЕМУ краю (ключ front, как AzNeft и Filarmoniya v1.17.10):
край — длинная сторона наименьшего прямоугольника полигона, ближняя к трассе; глубина d — короткая сторона (не больше D_MAX); высота
h ≈ 0.72·d (у AzNeft 9/12, Filarmoniya 7/10). Если передний край ближе GAP м к построенной стене (стена кромки, ломаные карманов) —
трибуна отодвигается от неё целиком (полигоны gpg ненадёжны: Khazar заходит на полотно). Не ставятся: зоны стоячих мест (General
Admission), Paddock Club (это верх здания боксов), AzNeft и Filarmoniya (уже стоят). Сверка с онбоардом — в tracks/baku.md.
    node dump-wall.js && python3 stands.py [--check] [index.html]"""
import json, math, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
import pockets
xz, ll = pockets.xz, pockets.ll
W = json.load(open('wall.json')); P, R, S, HW, WL, WR = W['P'], W['R'], W['S'], W['HW'], W['WL'], W['WR']; M = len(P)
GAP, D_MAX, H_K = 3.0, 14.0, 0.72
SKIP = ('General Admission', 'Paddock Club', 'AzNeft', 'Filarmoniya')
# по онбоарду поула 2026 (кадры): что видно — для записи
SEEN = {'Absheron A': 'k419–k425: справа за стеной Qatar Airways трибуны с публикой', 'Absheron B': 'k425–k428: справа трибуны',
        'Absheron C': 'k12–k18, k429: справа трибуны вдоль старт-финиша', 'Absheron D': 'k20–k22: справа трибуны до T1',
        'Absheron E': 'k23–k28: справа перед T1 трибуна', 'Khazar': 'k382–k386: слева большая трибуна с публикой',
        'Bulvar': 'k384–k386: справа за сеткой', 'Sahil': 'k381–k383: справа за сеткой', 'Mugham': 'k364–k366: справа за сеткой',
        'Icheri Sheher': 'k239–k241: справа за сеткой на подъёме', 'Zafar': 'k410–k414: справа за сеткой, за деревьями бульвара',
        'Marine': 'k343–k345: справа за сеткой', 'Giz Galasi': 'k345–k347: справа за сеткой'}
walls = []
for sg, Wa in ((1, WR), (-1, WL)):
    V = W['VR'] if sg > 0 else W['VL']
    run = []
    for i in range(M):
        if V and not V[i]:
            if len(run) > 1: walls.append(LineString(run))
            run = []; continue
        run.append((P[i][0] + R[i][0] * sg * Wa[i], P[i][1] + R[i][1] * sg * Wa[i]))
    if len(run) > 1: walls.append(LineString(run))
for g in W.get('GAPS', []): walls.append(LineString([tuple(p) for p in g['path']]))
WALLS = unary_union(walls)
AXIS = LineString([tuple(p) for p in P] + [tuple(P[0])])
ROAD = unary_union([Polygon([(P[i][0] - R[i][0] * WL[i], P[i][1] - R[i][1] * WL[i]), (P[j][0] - R[j][0] * WL[j], P[j][1] - R[j][1] * WL[j]),
                             (P[j][0] + R[j][0] * WR[j], P[j][1] + R[j][1] * WR[j]), (P[i][0] + R[i][0] * WR[i], P[i][1] + R[i][1] * WR[i])]).buffer(0)
                    for i in range(M) for j in [(i + 1) % M] if math.dist(P[i], P[j]) < 20])
for g in W.get('GAPS', []):
    if g.get('pocket'):
        ks = [k % M for k in range(g['to'], g['from'] - (M if g['to'] < g['from'] else 0) - 1, -1)]
        ROAD = ROAD.union(Polygon([tuple(t) for t in g['path']] + [tuple(P[k]) for k in ks]).buffer(0))


def front_of(poly):
    rr = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    ed = [(rr[k], rr[(k + 1) % 4]) for k in range(4)]
    L = [math.dist(a, b) for a, b in ed]
    cand = sorted(range(4), key=lambda k: -L[k])[:2] if max(L) > 1.3 * min(L) else range(4)
    k = min(cand, key=lambda k: AXIS.distance(LineString(ed[k])))
    a, b = ed[k]; d = L[(k + 1) % 4]
    c = poly.centroid; dx, dz = b[0] - a[0], b[1] - a[1]; n = (-dz / L[k], dx / L[k])   # вправо от A→B, как frontStand
    if (c.x - (a[0] + b[0]) / 2) * n[0] + (c.y - (a[1] + b[1]) / 2) * n[1] < 0: a, b = b, a; n = (-n[0], -n[1])
    return a, b, n, d


rows = []
for g in json.load(open('gpg_baku.json'))['grandstands']:
    name = g['name']
    if any(name.startswith(s) for s in SKIP): continue
    poly = Polygon([xz(c['lat'], c['lng']) for c in g['coordinates']]).buffer(0)
    a, b, n, d = front_of(poly); d = min(d, D_MAX)
    # от стены и полотна: передний край не ближе GAP к стене и не на полотне (сдвиг по нормали трибуны)
    sh = 0.0
    for _ in range(80):
        A = (a[0] + n[0] * sh, a[1] + n[1] * sh); B = (b[0] + n[0] * sh, b[1] + n[1] * sh); seg = LineString([A, B])
        foot = Polygon([A, B, (B[0] + n[0] * d, B[1] + n[1] * d), (A[0] + n[0] * d, A[1] + n[1] * d)])
        if seg.distance(WALLS) >= GAP and not foot.intersects(ROAD): break
        sh += 0.5
    q = min(range(M), key=lambda t: math.dist(P[t], ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)))
    h = round(max(5.0, min(11.0, H_K * d)), 1)
    rows.append(dict(name=name, A=A, B=B, d=round(d, 1), h=h, sh=sh, S=S[q], len=math.dist(A, B), wall=seg.distance(WALLS)))
rows.sort(key=lambda r: r['S'])
for r in rows:
    print('%-14s S%5.0f длина %4.0f м, глубина %4.1f, высота %4.1f, сдвиг от gpg %4.1f м, до стены %4.1f м' % (r['name'], r['S'], r['len'], r['d'], r['h'], r['sh'], r['wall']), file=sys.stderr)
if '--check' in sys.argv: sys.exit()
L = ["    {kind:'grandstand', shape:'arc', name:'%s', h:%g, d:%g, front:[[%.6f,%.6f],[%.6f,%.6f]]},   // %s; %d м%s"
     % (r['name'], r['h'], r['d'], *ll(*r['A']), *ll(*r['B']), SEEN.get(r['name'], ''), round(r['len']),
        ', от полигона gpg отодвинута на %.1f м' % r['sh'] if r['sh'] else '') for r in rows]
HTML = next((a for a in sys.argv[1:] if not a.startswith('--')), '../../index.html')
s = open(HTML).read(); i = s.index('const SCENERY_BAKU = {'); j = s.index('\n};', i); blk = s[i:j]
blk = re.sub(r"\n    // Трибуны круга \(v1\.17\.13.*?// конец трибун круга", '', blk, flags=re.S)
k = blk.index('  objects: ['); k2 = blk.index('\n  ],', k)
blk = blk[:k2] + "\n    // Трибуны круга (v1.17.13, tools/baku-scan/stands.py): место — полигоны grandprixguides, передний край к трассе\n" + '\n'.join(L) + "\n    // конец трибун круга" + blk[k2:]
s = s[:i] + blk + s[j:]; open(HTML, 'w').write(s); print('трибун: %d' % len(rows), file=sys.stderr)
