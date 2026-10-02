#!/usr/bin/env python3
"""Середина проезжей части по ТРОТУАРАМ OSM (footway=sidewalk и пешеходные дорожки вдоль улиц).

Для станции контура: ближайшая линия тротуара СЛЕВА и СПРАВА (2.5–13 м, по нормали,
только отрезки почти параллельные дороге — угол < 30°). Середина = среднее двух;
сравнивается с контуром. Независимо от оси улицы OSM (osmoff.py): тротуары рисуют
отдельно, по кромке. Полуширина тротуарной линии гасится, если тротуары с обеих сторон.

    python3 sidewalk.py [--step=5]   -> sw.tsv (S, левый, правый, центр)
"""
import math, sys, osm, mc
DS = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 5))
D = osm.load(); W = D['ways']; N = D['nodes']
segs = []
for w in W.values():
    t = w['tags']
    if t.get('footway') == 'sidewalk' or (t.get('highway') in ('footway', 'pedestrian') and t.get('footway') not in ('crossing', 'link')):
        p = [mc.xy(*N[n]) for n in w['nodes'] if n in N]
        for i in range(len(p) - 1): segs.append((p[i], p[i + 1]))


def side_hits(q, tn, n):
    L, R = None, None
    for a, b in segs:
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy)
        if l < 0.5: continue
        if abs(dx / l * tn[0] + dy / l * tn[1]) < math.cos(math.radians(30)): continue
        # пересечение нормали из q с отрезком
        den = n[0] * dy - n[1] * dx
        if abs(den) < 1e-9: continue
        s = ((a[0] - q[0]) * dy - (a[1] - q[1]) * dx) / den     # расстояние вдоль нормали
        u = ((a[0] - q[0]) * n[1] - (a[1] - q[1]) * n[0]) / den  # доля вдоль отрезка
        if not (0 <= u <= 1): continue
        if 2.5 <= s <= 13 and (L is None or s < L): L = s
        if -13 <= s <= -2.5 and (R is None or s > R): R = s
    return L, R


rows = []; S = 0.0
while S < mc.TOT:
    p, t = mc.at(S); n = (-t[1], t[0]); L, R = side_hits(p, t, n)
    rows.append((S, L, R)); S += DS
both = [(s, l, r) for s, l, r in rows if l is not None and r is not None]
open('sw.tsv', 'w').write('S\tleft\tright\tcentre\n' + ''.join('%.1f\t%s\t%s\t%s\n' % (s, '' if l is None else '%.2f' % l, '' if r is None else '%.2f' % r, '%.2f' % ((l + r) / 2) if l is not None and r is not None else '') for s, l, r in rows))
c = sorted((l + r) / 2 for _, l, r in both); w = sorted(l - r for _, l, r in both)
q = lambda a, f: a[int(f * (len(a) - 1))]
print('станций %d, с тротуарами по обе стороны %d; ширина между тротуарами медиана %.1f; центр от контура: 10%% %+.1f медиана %+.1f 90%% %+.1f'
      % (len(rows), len(both), q(w, .5), q(c, .1), q(c, .5), q(c, .9)))
for k in range(0, int(mc.TOT // 100) + 1):
    part = [(l + r) / 2 for s, l, r in both if k * 100 <= s < k * 100 + 100]
    print('%5d  n=%2d  %s' % (k * 100, len(part), ('ср %+5.1f  %+5.1f…%+5.1f' % (sum(part) / len(part), min(part), max(part))) if part else '—'))
