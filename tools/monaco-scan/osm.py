#!/usr/bin/env python3
"""OSM вокруг трассы Монако: склейка тайлов osm/*.osm (API 0.6 /map) в один словарь.

    import osm; D = osm.load()   # {'nodes':{id:(lat,lon)}, 'ways':{id:{'nodes':[..],'tags':{}}}, 'rels':{...}}
    python3 osm.py               # сводка: дорожки трассы, здания с высотой, береговая линия
Тайлы качаются один раз (bbox 7.412–7.438, 43.728–43.746, шаг 0.004°, 01.10.2026); склейка —
osm/all.json, в репозитории — osm/all.json.gz (сырые тайлы и несжатая склейка не хранятся).
"""
import glob, gzip, json, os, xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'osm', 'all.json')


def load():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    if os.path.exists(CACHE + '.gz'):              # в репозитории лежит сжатая склейка (0.9 МБ)
        return json.load(gzip.open(CACHE + '.gz', 'rt'))
    N, W, R = {}, {}, {}
    for fn in sorted(glob.glob(os.path.join(HERE, 'osm', 't_*.osm'))):
        root = ET.parse(fn).getroot()
        for e in root:
            tags = {t.get('k'): t.get('v') for t in e.findall('tag')}
            if e.tag == 'node':
                N[e.get('id')] = (float(e.get('lat')), float(e.get('lon')))
            elif e.tag == 'way':
                W[e.get('id')] = {'nodes': [n.get('ref') for n in e.findall('nd')], 'tags': tags}
            elif e.tag == 'relation':
                R[e.get('id')] = {'members': [(m.get('type'), m.get('ref'), m.get('role')) for m in e.findall('member')], 'tags': tags}
    D = {'nodes': N, 'ways': W, 'rels': R}
    json.dump(D, open(CACHE, 'w'))
    return D


if __name__ == '__main__':
    D = load()
    W = D['ways']
    print('узлов', len(D['nodes']), 'путей', len(W), 'отношений', len(D['rels']))
    rw = [k for k, w in W.items() if w['tags'].get('highway') == 'raceway']
    print('raceway:', len(rw), sorted(set(W[k]['tags'].get('name', '?') for k in rw)))
    b = [w for w in W.values() if 'building' in w['tags']]
    hb = [w for w in b if 'height' in w['tags'] or 'building:levels' in w['tags']]
    print('зданий', len(b), 'с высотой или этажами', len(hb))
    for k, r in D['rels'].items():
        t = r['tags']
        if 'Monaco' in t.get('name', '') and ('circuit' in str(t).lower() or t.get('sport') == 'motor' or t.get('highway') == 'raceway'):
            print('отношение', k, t.get('name'), t.get('type'), len(r['members']))
