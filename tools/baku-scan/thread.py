#!/usr/bin/env python3
"""Нитка телеметрии F1 против оси OSM: отступ нитки (8 лучших кругов квалы 2026, все по одной линии — разброс
между пилотами 0.2 м медианой) от контура по станциям, сглаженный σ=10 м. Пишет thread.tsv, печатает участки,
где нитка уходит от оси OSM дальше LIM м — их смотреть глазами (view.py / unroll.py).

    python3 thread.py [--lim=2]
"""
import json, sys, numpy as np, bk
LIM = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--lim=')), 2))
fit = json.load(open('openf1/fit.json')); Rm = np.array(fit['R']); s = fit['s']; t = np.array(fit['t']); mir = fit['mirror']
S, O = [], []
for L in json.load(open('openf1/quali_top8.json')):
    F = np.array([[x, y] for x, y, z in L['loc']], float) * 0.1 * [1, mir]
    for p in (s * (Rm @ F.T)).T + t:
        a, side, d = bk.proj(tuple(p)); S.append(a); O.append(side)
S, O = np.array(S), np.array(O); T = bk.TOT
st = np.arange(0, T, 5.0); sm = []
for s0 in st:
    d = (S - s0 + T / 2) % T - T / 2; w = np.exp(-0.5 * (d / 10) ** 2)
    sm.append((w * O).sum() / w.sum() if w.sum() > 0.5 else np.nan)
sm = np.array(sm)
open('thread.tsv', 'w').write('S\toff\n' + ''.join('%.1f\t%.2f\n' % r for r in zip(st, sm)))
print('нитка от оси OSM (+ влево): медиана %+.2f, |отступ| медиана %.2f, 90%% %.2f' % (np.nanmedian(sm), np.nanmedian(abs(sm)), np.nanpercentile(abs(sm), 90)))
bad = abs(sm) > LIM; i = 0
while i < len(st):
    if bad[i]:
        j = i
        while j + 1 < len(st) and bad[j + 1]: j += 1
        k = i + np.argmax(abs(sm[i:j + 1]))
        print('  S %4d–%4d  наиб %+.1f м' % (st[i], st[j], sm[k]))
        i = j + 1
    else: i += 1
