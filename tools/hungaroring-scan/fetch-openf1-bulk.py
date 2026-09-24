#!/usr/bin/env python3
"""Качает МНОГО точек положения из openf1 и кладёт в кэш.

    python3 fetch-openf1-bulk.py <session_key> <ISO-начало> <ISO-конец> [файл]

Качает по одному пилоту и по окнам в 5 минут: широкий запрос сервер обрывает.
"""
import json, sys, time, urllib.parse, urllib.request, datetime, collections

API = 'https://api.openf1.org/v1/'


def get(path, **q):
    url = API + path + '?' + urllib.parse.urlencode(q, safe='<>=')
    req = urllib.request.Request(url, headers={'User-Agent': 'apex26-dev'})
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except Exception as e:
            if a == 3:
                raise
            time.sleep(2 * (a + 1))


def main():
    sk = int(sys.argv[1]); t0 = sys.argv[2]; t1 = sys.argv[3]
    out = sys.argv[4] if len(sys.argv) > 4 else 'bulk_%d.json' % sk
    drv = sorted({d['driver_number'] for d in get('drivers', session_key=sk)})
    a = datetime.datetime.fromisoformat(t0); b = datetime.datetime.fromisoformat(t1)
    pts = []
    for dn in drv:
        c = a
        while c < b:
            d = min(b, c + datetime.timedelta(minutes=5))
            r = get('location', session_key=sk, driver_number=dn,
                    **{'date>': c.isoformat(), 'date<': d.isoformat()})
            pts += [[p['driver_number'], p['date'], p['x'], p['y'], p['z']]
                    for p in r if p['x'] or p['y']]
            c = d
        print('  %3d: всего %d' % (dn, len(pts)), flush=True)
    json.dump(pts, open(out, 'w'))
    print('сохранено %d точек в %s' % (len(pts), out))


main()
