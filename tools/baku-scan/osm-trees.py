#!/usr/bin/env python3
"""Деревья OSM у трассы Баку → osm/trees.json (v1.17.5, порт monaco-scan: в osm/all.json теги узлов не хранятся).

    python3 osm-trees.py      # API 0.6 /map, та же рамка, что osm.py (49.829–49.857 / 40.361–40.378, шаг 0.004°)
{'nodes': {id: [lat, lon, {теги}]}} — только natural=tree.
"""
import json, os, urllib.request, xml.etree.ElementTree as ET, time
HERE = os.path.dirname(os.path.abspath(__file__))
out = {}
lo = 49.829
while lo < 49.857 - 1e-9:
    la = 40.361
    while la < 40.378 - 1e-9:
        u = 'https://api.openstreetmap.org/api/0.6/map?bbox=%.3f,%.3f,%.3f,%.3f' % (lo, la, min(lo + 0.004, 49.857), min(la + 0.004, 40.378))
        for a in range(5):
            try:
                x = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'apex26-research'}), timeout=90).read(); break
            except Exception:
                time.sleep(3 * (a + 1))
        for e in ET.fromstring(x).findall('node'):
            t = {q.get('k'): q.get('v') for q in e.findall('tag')}
            if t.get('natural') == 'tree':
                out[e.get('id')] = [float(e.get('lat')), float(e.get('lon')), t]
        la += 0.004
    lo += 0.004
json.dump({'nodes': out}, open(os.path.join(HERE, 'osm', 'trees.json'), 'w'), ensure_ascii=False)
print('деревьев OSM:', len(out))
