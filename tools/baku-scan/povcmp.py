#!/usr/bin/env python3
"""Поза болида онбоарда в координатах игры для кадров K: место и курс — по телеметрии поула 2026 (время кадра как в kadry.py,
поправка openf1 −0.425 с), перевод в систему игры (начало — как SCEN_ORIGIN.Baku: среднее точек az-center.geojson, X отражён).
    python3 povcmp.py K [K …]  -> povs.json (для povcmp.js)"""
import json, sys, math, datetime, numpy as np, bk
g = json.load(open('az-center.geojson'))['features'][0]['geometry']['coordinates']; g = g[:-1] if g[0] == g[-1] else g
lat0 = sum(p[1] for p in g) / len(g); lon0 = sum(p[0] for p in g) / len(g); mlon = 111320 * math.cos(math.radians(lat0))
D = json.load(open('openf1/lap_rus_2026_wide.json')); t0 = datetime.datetime.fromisoformat(D['date_start'])
sec = lambda r: (datetime.datetime.fromisoformat(r['date']) - t0).total_seconds()
L = sorted(D['location'], key=sec); tl = np.array([sec(r) for r in L]); xs = np.array([r['x'] for r in L], float); ys = np.array([r['y'] for r in L], float)
fit = json.load(open('openf1/fit.json')); Rm = np.array(fit['R']); s = fit['s']; tr = np.array(fit['t']); mir = fit['mirror']
def game(t):
    p = np.array([np.interp(t, tl, xs), np.interp(t, tl, ys)]) * 0.1 * [1, mir]; q = s * (Rm @ p) + tr
    la, lo = bk.latlon(*q); return np.array([-(lo - lon0) * mlon, (la - lat0) * 110540])
out = []
for k in map(int, sys.argv[1:]):
    t = 0.25 * k - 3.2 - 0.425; a = game(t - 0.35); b = game(t + 0.35); p = game(t); d = b - a
    out.append({'k': k, 'x': p[0], 'z': p[1], 'hdg': math.atan2(d[0], d[1])})
json.dump(out, open('povs.json', 'w')); print(out)
