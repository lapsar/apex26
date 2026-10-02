#!/usr/bin/env python3
"""Замкнутая осевая трассы по OSM: пути отношения 148194 «Circuit de Monaco», сцепленные
в кольцо (без пит-лейна и выезда с него), в метрах той же системы, что mc-1929.

    import osmloop; L = osmloop.loop()   # [(x,y), ...] по ходу гонки
    python3 osmloop.py                   # длина, число точек, где start-finish
"""
import math, osm, mc

SKIP_ROLES = {'pit_lane'}
SKIP_NAMES = {'Sortie des stands', 'Voie des stands'}


def loop():
    D = osm.load(); W = D['ways']; N = D['nodes']
    r = D['rels']['148194']
    segs = []
    for t, ref, role in r['members']:
        if t != 'way' or role in SKIP_ROLES: continue
        w = W[ref]
        if w['tags'].get('name') in SKIP_NAMES: continue
        segs.append(list(w['nodes']))
    chain = segs.pop(0)
    while segs:
        end = chain[-1]
        for k, s in enumerate(segs):
            if s[0] == end: chain += s[1:]; segs.pop(k); break
            if s[-1] == end: chain += s[::-1][1:]; segs.pop(k); break
        else:
            raise RuntimeError('кольцо не сцепилось у узла %s, осталось %d путей' % (end, len(segs)))
    if chain[0] == chain[-1]: chain = chain[:-1]
    pts = [mc.xy(*N[n]) for n in chain]
    # направление — как у контура mc-1929 (по ходу гонки): сравнить знак площади
    if (area(pts) > 0) != (area(mc.R) > 0): pts = pts[::-1]; chain = chain[::-1]
    return pts, chain


def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


if __name__ == '__main__':
    pts, chain = loop()
    L = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
    print('точек', len(pts), 'длина %.1f м' % L, 'площадь %.0f' % area(pts), 'контур mc-1929: %.1f м, площадь %.0f' % (mc.TOT, area(mc.R)))
    sf = '4937755860'
    D = osm.load(); print('start-finish узел', sf, 'на кольце' if sf in chain else 'НЕ на кольце', mc.xy(*D['nodes'][sf]))
