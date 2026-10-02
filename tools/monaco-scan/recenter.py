#!/usr/bin/env python3
"""ПЕРЕСАДКА контура Монако на середину проезжей части (по образцу hungaroring-scan/recenter.py).

Источники отступа середины от контура (+ влево по ходу), оба из OSM и независимые:
  osmoff.tsv — ось улицы трассы (отношение 148194), есть на всём круге;
  sw.tsv     — середина между тротуарами слева и справа, есть на ~36 % круга.
На станции берётся медиана имеющихся, затем сглаживание по кругу σ=20 м; каждая точка
контура сдвигается по своей нормали на этот отступ. Число и порядок точек те же.
В ТОННЕЛЕ (S≈715–1025) источник один — ось OSM: снимок под отелем слеп, тротуаров нет.
Взята она ради согласия с домами OSM, из которых строится мир (стены тоннеля и отель).

    MC_GEOJSON=<вход> python3 osmoff.py --tsv=osmoff.tsv && MC_GEOJSON=<вход> python3 sidewalk.py
    MC_GEOJSON=<вход> python3 recenter.py <выход.geojson>
"""
import json, math, sys, os, numpy as np, mc
out = sys.argv[1]
OS, SW = {}, {}
for l in open('osmoff.tsv').read().splitlines()[1:]:
    r = l.split('\t')
    if r[1]: OS[round(float(r[0]))] = float(r[1])
for l in open('sw.tsv').read().splitlines()[1:]:
    r = l.split('\t')
    if r[3]: SW[round(float(r[0]))] = float(r[3])
# отбраковка: тротуары врут там, где тротуар есть лишь на дальней стороне площади или
# перекрёстка; разошлись с осью улицы больше чем на 2 м — верим оси (замер 01.10.2026:
# без этого второй проход раздувал остаток до 5 м)
A = {}
for s, o in OS.items():
    w = SW.get(s); A[s] = o if w is None or abs(w - o) > 2.0 else (o + w) / 2
for s, w in SW.items():
    if s not in A: A[s] = w
S = np.array(sorted(A)); v = np.array([A[s] for s in S]); T = mc.TOT


def sm(s0, sig=20.0):
    d = (S - s0 + T / 2) % T - T / 2; w = np.exp(-0.5 * (d / sig) ** 2); return (w * v).sum() / w.sum()


n = len(mc.R); new = []; sh = []
for i in range(n):
    a, b, c = mc.R[i - 1], mc.R[i], mc.R[(i + 1) % n]
    t1 = np.subtract(b, a); t1 /= np.hypot(*t1); t2 = np.subtract(c, b); t2 /= np.hypot(*t2)
    t = t1 + t2; t /= np.hypot(*t); nrm = (-t[1], t[0])
    o = sm(mc.CUM[i]); sh.append(o)
    new.append((b[0] + nrm[0] * o, b[1] + nrm[1] * o))
coords = [[round(mc.LON0 + x / mc.MPD_LON, 7), round(mc.LAT0 + y / mc.MPD_LAT, 7)] for x, y in new]
coords.append(coords[0])
g = json.load(open(os.path.join(mc.HERE, 'mc-1929.geojson')))
g['features'][0]['geometry']['coordinates'] = coords
g['features'][0]['properties']['note'] = 'mc-1929 пересажен на середину проезжей части по OSM (tools/monaco-scan/recenter.py)'
json.dump(g, open(out, 'w'))
sh = np.array(sh)
print('точек %d; сдвиг: медиана |%.2f| м, 90%% |%.2f|, наибольший %+.2f м' % (n, np.median(abs(sh)), np.percentile(abs(sh), 90), sh[np.argmax(abs(sh))]))
