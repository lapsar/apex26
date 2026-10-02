#!/usr/bin/env python3
"""Сдвиг контура mc-1929 от осевых улиц OSM (пути отношения 148194 без пит-лейна).

Для станции через DS м вдоль контура: ближайшая точка на отрезках OSM в пределах
MAXD м, её смещение поперёк контура (+ влево по ходу). Печатает сводку и таблицу
по участкам. ОСЬ УЛИЦЫ В OSM — середина ПРОЕЗЖЕЙ ЧАСТИ (а не трассы); где улица
разделена на две однопутные ветки (бульвар), ось ветки — это середина её половины.

    python3 osmoff.py [--step=10] [--tsv=osmoff.tsv]
"""
import math, sys, osm, mc
DS = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 10))
TSV = next((a.split('=')[1] for a in sys.argv if a.startswith('--tsv=')), None)
MAXD = 25.0


def segments():
    D = osm.load(); W = D['ways']; N = D['nodes']; out = []
    for t, ref, role in D['rels']['148194']['members']:
        if t != 'way' or role == 'pit_lane': continue
        w = W[ref]
        if w['tags'].get('name') in ('Sortie des stands', 'Voie des stands'): continue
        p = [mc.xy(*N[n]) for n in w['nodes']]
        for i in range(len(p) - 1): out.append((p[i], p[i + 1], w['tags'].get('name', '?'), ref))
    return out


def offset(q, n, segs):
    best = None
    for a, b, name, ref in segs:
        dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
        if L2 < 1e-6: continue
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2))
        px, py = a[0] + dx * t, a[1] + dy * t; d = math.hypot(px - q[0], py - q[1])
        if d < MAXD and (best is None or d < best[0]):
            best = (d, (px - q[0]) * n[0] + (py - q[1]) * n[1], name)
    return best


if __name__ == '__main__':
    segs = segments(); rows = []
    S = 0.0
    while S < mc.TOT:
        p, d = mc.at(S); n = (-d[1], d[0])          # нормаль влево по ходу
        o = offset(p, n, segs)
        rows.append((S, None if o is None else o[1], None if o is None else o[2]))
        S += DS
    got = [r for r in rows if r[1] is not None]
    v = sorted(r[1] for r in got)
    q = lambda f: v[int(f * (len(v) - 1))]
    print('станций %d, с OSM рядом %d; сдвиг середины улицы от контура (+ влево): 10%% %.1f, медиана %.1f, 90%% %.1f, край %.1f…%.1f'
          % (len(rows), len(got), q(.1), q(.5), q(.9), v[0], v[-1]))
    # участки по 100 м
    for k in range(0, int(mc.TOT // 100) + 1):
        part = [r for r in got if k * 100 <= r[0] < k * 100 + 100]
        if not part: print('%5d  —' % (k * 100)); continue
        o = [r[1] for r in part]
        print('%5d  %+5.1f …%+5.1f  ср %+5.1f  %s' % (k * 100, min(o), max(o), sum(o) / len(o), part[0][2][:30]))
    if TSV:
        open(TSV, 'w').write('S_contour\toff\tname\n' + ''.join('%.1f\t%s\t%s\n' % (r[0], '' if r[1] is None else '%.2f' % r[1], r[2] or '') for r in rows))
