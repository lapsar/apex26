#!/usr/bin/env python3
"""Несколько быстрых кругов квалификации с положениями — сверка линий секторов (10.2026, v1.16.95).

    python3 openf1-sector-laps.py silverstone_lap.json /tmp/silverstone_multi.json 8
    node sector-lines.js Silverstone=/tmp/silverstone_multi.json

Берёт сессию из файла openf1-lap.py, N самых быстрых кругов (не медленнее поула на 3 %)
всех пилотов и их положения (±4 с вокруг круга). Разброс линии по кругам — мерка точности
(44 круга 2026: ±8 м); в игру — медиана. Файлы большие (~300 КБ), в репозиторий не идут.
"""
import json, sys, urllib.parse, urllib.request
API='https://api.openf1.org/v1/'
def get(path, **q):
    url=API+path+'?'+urllib.parse.urlencode(q, safe='<>=')
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'apex26-dev'}), timeout=180) as r: return json.load(r)
src=json.load(open(sys.argv[1])); s=src['session']; out=sys.argv[2]
laps=[l for l in get('laps', session_key=s['session_key']) if l.get('lap_duration') and l.get('duration_sector_1') and l.get('duration_sector_2') and l['lap_duration']<src['lap']['lap_duration']*1.03]
laps.sort(key=lambda l:l['lap_duration']); laps=laps[:int(sys.argv[3]) if len(sys.argv)>3 else 8]
res=[]
import datetime
for l in laps:
    t0=datetime.datetime.fromisoformat(l['date_start'])
    a=(t0-datetime.timedelta(seconds=4)).isoformat(); b=(t0+datetime.timedelta(seconds=l['lap_duration']+4)).isoformat()
    loc=get('location', session_key=s['session_key'], driver_number=l['driver_number'], **{'date>':a,'date<':b})
    loc=[p for p in loc if p['x'] or p['y']]
    res.append(dict(lap=l, location=loc)); print(l['driver_number'], l['lap_number'], l['lap_duration'], len(loc), flush=True)
json.dump(dict(session=s, laps=res), open(out,'w'))
