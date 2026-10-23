#!/usr/bin/env python3
"""Баку в index.html (скрытой): контур az-center.geojson -> TRACKDATA.Baku, spec в конец TRACKS (widths — полуширина по
участкам из az-center-width.tsv через 10 м), SCEN_ORIGIN.Baku, STAGE.Baku. Повторный запуск заменяет прежние строки Баку.
Перевод координат — как у всех трасс (tools/hungaroring-scan/convert.py): lat0/lon0 — среднее точек без дубля,
x=(lon-lon0)*111320*cos(lat0), y=(lat-lat0)*110540, округление 0.1 м.

    python3 mkgame.py [путь к index.html] [--visible]
"""
import json, math, re, sys, numpy as np
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
HTML = ARGS[0] if ARGS else '../../index.html'
HID = '' if '--visible' in sys.argv else 'hidden:true,'   # --visible: в меню (v1.17.0 — проехать полотно)
g = json.load(open('az-center.geojson'))['features'][0]['geometry']['coordinates']
g = g[:-1] if g[0] == g[-1] else g
lat0 = sum(p[1] for p in g) / len(g); lon0 = sum(p[0] for p in g) / len(g); mlon = 111320 * math.cos(math.radians(lat0))
pts = [[round((p[0] - lon0) * mlon, 1), round((p[1] - lat0) * 110540, 1)] for p in g]
L = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
W = np.array([[float(x) for x in l.split('\t')[:2]] for l in open('az-center-width.tsv').read().splitlines()[1:]])
ws = [[int(s), round(float(np.interp(s, W[:, 0], W[:, 1], period=L)), 1)] for s in range(0, int(L), 10)]
SECT = json.load(open('sectors.json')) if __import__('os').path.exists('sectors.json') else [1790, 3640]
td = '"Baku":{"pts":' + json.dumps(pts, separators=(',', ':')) + ',"len":%d}' % round(L)
spec = ('  /* Баку (10.2026, v1.17.0 — открыта в меню: проехать полотно, окружения ещё нет): контур — пути OSM-отношения 11266687, пересажен на середину замеренной\n'
        '     дороги (tools/baku-scan: edges.py, recenter.py); линия старта — узел OSM «Start Line», поул решётки 2026 в 2.3 м;\n'
        '     widths — полуширина по участкам [S м, полуширина м] «как в жизни» (решение владельца 23.10.2026): замок 3.8, прямая до 11.5. */\n'
        '  {name:"Baku",key:"Baku",sectors:' + json.dumps(SECT) + ',cc:"Азербайджан",c:"#00B5E2",half:7.0,style:"street",runoff:1.6,grip:1.0,twist:5,speed:4,sfShift:0,' + HID + '\n'
        '   widths:' + json.dumps(ws, separators=(',', ':')) + ',\n'
        '   desc:"Улицы Баку: узкий замок у стен Старого города и самая длинная прямая календаря вдоль набережной."},\n')
s = open(HTML).read()
# TRACKDATA
s = re.sub(r',"Baku":\{"pts":\[.*?\],"len":\d+\}', '', s, flags=re.S)
i = s.index('const TRACKDATA='); j = s.index('}};\n', i); s = s[:j + 1] + ',' + td + s[j + 1:]
# TRACKS: убрать прежний spec Баку и вставить в конец массива
s = re.sub(r'  /\* Баку \(10\.2026.*?\n  \{name:"Baku".*?\},\n', '', s, flags=re.S)
i = s.index('const TRACKS=['); j = s.index('\n];', i)
if s[j - 1] != ',': s = s[:j] + ',' + s[j:]; j += 1          # у последней трассы запятой нет
s = s[:j + 1] + spec + s[j + 1:]
# SCEN_ORIGIN
s = re.sub(r',\n  Baku:\{lat0:[^}]*\}', '', s)
i = s.index('const SCEN_ORIGIN='); j = s.index('}};', i)
s = s[:j + 1] + ',\n  Baku:{lat0:%.9f,lon0:%.9f,mlon:%.6f}' % (lat0, lon0, mlon) + s[j + 1:]
# STAGE
s = re.sub(r",\n  Baku:\{gp:'Гран-при Азербайджана'[^}]*\}", '', s)
i = s.index('const STAGE={'); j = s.index('}};', i)
s = s[:j + 1] + ",\n  Baku:{gp:'Гран-при Азербайджана',circ:'Baku City Circuit',city:'Баку',ru:'Баку',fl:'az'}" + s[j + 1:]
open(HTML, 'w').write(s)
print('точек %d, круг %.0f м, widths %d, lat0 %.6f lon0 %.6f' % (len(pts), L, len(ws), lat0, lon0))
