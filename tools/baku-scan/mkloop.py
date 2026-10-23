#!/usr/bin/env python3
"""Контур Баку из OSM: пути отношения 11266687 (без пит-лейна) сцеплены в кольцо через общие концы
(у каждого конца ровно два пути), развёрнуты по ходу гонки (телеметрия openf1 шла против порядка путей)
и начаты с узла, ближайшего к началу контура bacinger az-2016. Пишет az-osm.geojson.

    python3 mkloop.py
"""
import collections, json, math, os, osm
HERE = os.path.dirname(os.path.abspath(__file__))
D = osm.load(); N = D['nodes']; W = D['ways']
rel = D['rels']['11266687']
mem = [ref for t, ref, role in rel['members'] if t == 'way' and role != 'pit_lane']
at = collections.defaultdict(list)
for w in mem: at[W[w]['nodes'][0]].append(w); at[W[w]['nodes'][-1]].append(w)
assert max(len(v) for v in at.values()) == 2
seq = list(W[mem[0]]['nodes']); used = {mem[0]}
while True:
    nx = [w for w in at[seq[-1]] if w not in used]
    if not nx: break
    w = nx[0]; used.add(w); nd = W[w]['nodes']
    seq += nd[1:] if nd[0] == seq[-1] else nd[::-1][1:]
assert len(used) == len(mem) and seq[0] == seq[-1]
seq = seq[:-1][::-1]                                  # по ходу гонки
g = json.load(open(os.path.join(HERE, 'az-2016.geojson')))
b0 = g['features'][0]['geometry']['coordinates'][0]
k = min(range(len(seq)), key=lambda i: math.hypot((N[seq[i]][1] - b0[0]) * 84800, (N[seq[i]][0] - b0[1]) * 110540))
seq = seq[k:] + seq[:k]
co = [[N[n][1], N[n][0]] for n in seq]; co.append(co[0])
g['features'][0]['geometry']['coordinates'] = co
g['features'][0]['properties']['note'] = 'кольцо путей OSM-отношения 11266687 без пит-лейна, по ходу гонки (tools/baku-scan/mkloop.py)'
json.dump(g, open(os.path.join(HERE, 'az-osm.geojson'), 'w'))
print('точек %d, путей %d' % (len(seq), len(mem)))
