#!/usr/bin/env python3
"""Дома OSM за стартовой прямой (v1.17.18): тайлы API 0.6 /map к востоку от T1 (bbox 49.855–49.895, 40.368–40.392, шаг 0.004°,
29.10.2026; osm/far/t_*.osm — не хранятся) → osm/far.json.gz: только здания (building, building:part) и их узлы, отношения-мультиполигоны.
Нужен city.py для «дальнего города» (FAR_CONES). Тайлы: bash-цикл curl по сетке (см. tracks/baku.md, «Город за стартовой прямой»).
    python3 far-osm.py
"""
import glob, gzip, json, os, xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
N, W, R = {}, {}, {}
for fn in sorted(glob.glob(os.path.join(HERE, 'osm', 'far', 't_*.osm'))):
    for e in ET.parse(fn).getroot():
        tags = {t.get('k'): t.get('v') for t in e.findall('tag')}
        if e.tag == 'node':
            N[e.get('id')] = (float(e.get('lat')), float(e.get('lon')))
        elif e.tag == 'way':
            W[e.get('id')] = {'nodes': [n.get('ref') for n in e.findall('nd')], 'tags': tags}
        elif e.tag == 'relation':
            R[e.get('id')] = {'members': [(m.get('type'), m.get('ref'), m.get('role')) for m in e.findall('member')], 'tags': tags}
bld = lambda t: 'building' in t or 'building:part' in t
RK = {k: r for k, r in R.items() if bld(r['tags']) and r['tags'].get('type') == 'multipolygon'}
WK = {k: w for k, w in W.items() if bld(w['tags'])}
for r in RK.values():
    for t, ref, role in r['members']:
        if t == 'way' and ref in W:
            WK.setdefault(ref, W[ref])
NK = {n: N[n] for w in WK.values() for n in w['nodes'] if n in N}
json.dump({'nodes': NK, 'ways': WK, 'rels': RK}, gzip.open(os.path.join(HERE, 'osm', 'far.json.gz'), 'wt'))
print('osm/far.json.gz: путей %d (зданий %d), отношений %d, узлов %d' % (len(WK), sum(1 for w in WK.values() if 'building' in w['tags']), len(RK), len(NK)))
