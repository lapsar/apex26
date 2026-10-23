#!/usr/bin/env python3
"""Коридор улицы по OSM: от контура по нормали влево и вправо — до ближайшей стены дома, крепостной/подпорной стены
(здания и barrier=*wall) и до линии тротуара (footway=sidewalk, рисуется по середине тротуара). Дома и стены OSM —
то, из чего потом строится мир, поэтому дорога обязана помещаться между ними. Шаг 5 м → corridor.tsv.

    python3 corridor.py [S0 S1]     # печать участка; без аргументов — весь круг в файл
"""
import sys, math, numpy as np, osm, bk
D = osm.load(); N = D['nodes']; W = D['ways']
B, SW = [], []                          # отрезки препятствий и тротуаров (метры bk)
for w in W.values():
    t = w['tags']; nd = [bk.xy(*N[n]) for n in w['nodes'] if n in N]
    if len(nd) < 2: continue
    segs = [(nd[i], nd[i + 1]) for i in range(len(nd) - 1)]
    if 'building' in t or t.get('barrier') in ('city_wall', 'wall', 'retaining_wall') or t.get('historic') == 'citywalls': B += segs
    elif t.get('footway') == 'sidewalk': SW += segs
B = np.array(B); SWa = np.array(SW)


def ray(p, nrm, segs, rmax=30.0):
    """расстояние вдоль луча p + nrm·d до первого отрезка (d в 0.3..rmax), или None"""
    a, b = segs[:, 0], segs[:, 1]; v = b - a
    den = nrm[0] * v[:, 1] - nrm[1] * v[:, 0]
    ok = np.abs(den) > 1e-9
    w = a - p
    d = (w[:, 0] * v[:, 1] - w[:, 1] * v[:, 0]) / np.where(ok, den, 1)
    u = (w[:, 0] * nrm[1] - w[:, 1] * nrm[0]) / np.where(ok, den, 1)
    m = ok & (u >= 0) & (u <= 1) & (d > 0.3) & (d < rmax)
    return float(d[m].min()) if m.any() else None


def station(S):
    p, _ = bk.at(S); q1, _ = bk.at(S - 3); q2, _ = bk.at(S + 3)
    t = np.subtract(q2, q1); t /= np.hypot(*t); n = np.array([-t[1], t[0]]); p = np.array(p)
    return (S, ray(p, n, B), ray(p, -n, B), ray(p, n, SWa) if len(SWa) else None, ray(p, -n, SWa) if len(SWa) else None)


if __name__ == '__main__':
    if len(sys.argv) > 2:
        f = lambda v: '   —' if v is None else '%4.1f' % v
        print('    S   дом/стена слева  справа   тротуар слева  справа')
        for S in np.arange(float(sys.argv[1]), float(sys.argv[2]) + 0.1, 5):
            r = station(S); print('%5d   %s  %s      %s  %s' % (r[0], f(r[1]), f(r[2]), f(r[3]), f(r[4])))
    else:
        rows = [station(S) for S in np.arange(0, bk.TOT, 5.0)]
        g = lambda v: '' if v is None else '%.2f' % v
        open('corridor.tsv', 'w').write('S\tbld_left\tbld_right\tsw_left\tsw_right\n' + ''.join('%.1f\t%s\t%s\t%s\t%s\n' % (r[0], g(r[1]), g(r[2]), g(r[3]), g(r[4])) for r in rows))
        print('corridor.tsv', len(rows))
