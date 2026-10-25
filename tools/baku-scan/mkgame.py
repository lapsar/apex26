#!/usr/bin/env python3
"""Баку в index.html (скрытой): контур az-center.geojson -> TRACKDATA.Baku, spec в конец TRACKS (widths — полуширина по
участкам из az-center-width.tsv через 10 м), SCEN_ORIGIN.Baku, STAGE.Baku. Повторный запуск заменяет прежние строки Баку.
Перевод координат — как у всех трасс (tools/hungaroring-scan/convert.py): lat0/lon0 — среднее точек без дубля,
x=(lon-lon0)*111320*cos(lat0), y=(lat-lat0)*110540, округление 0.1 м.

    python3 mkgame.py [путь к index.html] [--visible]
    python3 mkgame.py [путь к index.html] --geom     (v1.17.14) только полотно: pts и len в TRACKDATA.Baku, widths в spec —
        остальной spec (railAds, комментарии сборок, failRoom…) и SCEN_ORIGIN не трогаются (перевод — по ПРЕЖНЕМУ началу координат,
        дома и стены OSM стоят где стояли). Ключи по S (railAds, sectors, garage fromS/toS) пересчитываются по месту: старая
        S → точка прежней осевой → ближайшая точка новой → новая S (сглаживание поворотов укорачивает круг на ~13 м).
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
if '--geom' in sys.argv:
    o = re.search(r'Baku:\{lat0:([\d.]+),lon0:([\d.]+),mlon:([\d.]+)\}', s); lat0, lon0, mlon = map(float, o.groups())
    pts = [[round((p[0] - lon0) * mlon, 1), round((p[1] - lat0) * 110540, 1)] for p in g]
    L = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
    ws = [[int(x), round(float(np.interp(x, W[:, 0], W[:, 1], period=L)), 1)] for x in range(0, int(L), 10)]
    m = re.search(r'"Baku":\{"pts":(\[.*?\]\]),"len":(\d+)\}', s); old = json.loads(m.group(1))
    def cum(P): c = [0.0]; [c.append(c[-1] + math.dist(P[i], P[(i + 1) % len(P)])) for i in range(len(P))]; return c
    co, cn = cum(old), cum(pts)
    def remap(S0):                                  # старая S -> точка прежней осевой -> ближайшая точка новой -> новая S
        S0 %= co[-1]; i = max(k for k in range(len(old)) if co[k] <= S0); a, b = old[i], old[(i + 1) % len(old)]
        t = (S0 - co[i]) / max(1e-9, co[i + 1] - co[i]); q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); best = None
        for k in range(len(pts)):
            a, b = pts[k], pts[(k + 1) % len(pts)]; dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
            u = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); d = math.hypot(a[0] + dx * u - q[0], a[1] + dy * u - q[1])
            if best is None or d < best[0]: best = (d, cn[k] + u * math.sqrt(L2))
        return round(best[1]) % round(L)
    s = s[:m.start(1)] + json.dumps(pts, separators=(',', ':')) + s[m.end(1):]
    s = re.sub(r'("Baku":\{"pts":\[.*?\]\],"len":)\d+', lambda q: q.group(1) + str(round(L)), s, flags=re.S)
    i = s.index('{name:"Baku",key:"Baku"'); j = s.index('\n', s.index('widths:', i))
    spec = s[i:j]
    spec = re.sub(r'widths:\[\[.*?\]\]', 'widths:' + json.dumps(ws, separators=(',', ':')), spec)
    spec = re.sub(r'sectors:\[([\d, ]+)\]', lambda q: 'sectors:[' + ', '.join(str(remap(float(v))) for v in q.group(1).split(',')) + ']', spec)
    ra = re.search(r'railAds:(\[\[.*?\]\]),', spec); z = json.loads(ra.group(1))
    z2 = [[0] + r[1:] if r[0] == 0 else [remap(r[0])] + r[1:] for r in z]
    spec = spec[:ra.start(1)] + json.dumps(z2, separators=(',', ':')) + spec[ra.end(1):]
    s = s[:i] + spec + s[j:]
    def gar(q): return 'garage:{fromS:%d, toS:%d}' % (remap(float(q.group(1))), remap(float(q.group(2))))
    s = re.sub(r'garage:\{fromS:(\d+), toS:(\d+)\}', lambda q: gar(q) if 'Pit garages' in s[max(0, q.start() - 200):q.start()] else q.group(0), s)
    open(HTML, 'w').write(s)
    print('полотно: точек %d, круг %.1f м (был %.1f), widths %d; sectors, railAds, garage — по месту:' % (len(pts), L, co[-1], len(ws)))
    print('  railAds', [(a[0], b[0]) for a, b in zip(z, z2) if a[0] != b[0]])
    sys.exit()
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
