#!/usr/bin/env python3
"""Ширина полотна Майами по спутнику — так подобрана полуширина 7.0 м.

Кромка ищется как БЕЛАЯ ЛИНИЯ: яркий и неокрашенный пиксель (иначе ловится
бирюзовая покраска зон вылета и красно-белый поребрик). Поперечники через 10 м
по всему кругу, снимок ESRI z19 (0.27 м/пкс).

Замер 09.2026: медиана ширины 13.7 м, половина круга 13-16 м, 30 % уже 13 м.
Отсюда half=7.0 — медиана, а не догадка.

    python3 halfwidth.py            # весь круг
"""
import json, math, sys
import numpy as np
from prof import at, rgb, TOT, SF

STEP = 0.15

def edge(p, n, side, lo=3.5, hi=16):
    best = (0, None)
    d = lo
    while d < hi:
        c = rgb(p[0] + n[0] * side * d, p[1] + n[1] * side * d)
        v = sum(c) / 3
        if v >= 130 and max(c) - min(c) <= 45 and v > best[0]:
            best = (v, d)
        d += STEP
    return best[1]

out = []
for S in range(0, int(TOT), 10):
    p, t = at(SF + S); n = [-t[1], t[0]]
    out.append((S, edge(p, n, -1), edge(p, n, 1)))
json.dump(out, open('edges.json', 'w'))

ok = [(S, l, r) for S, l, r in out if l and r and 4 <= l <= 11 and 4 <= r <= 11]
w = np.array([l + r for S, l, r in ok])
print('замеров с обеими кромками: %d из %d' % (len(ok), len(out)))
print('ширина полотна: медиана %.1f  10%%=%.1f 25%%=%.1f 75%%=%.1f 90%%=%.1f'
      % (np.median(w), *[np.percentile(w, q) for q in (10, 25, 75, 90)]))
print('доля круга: уже 13 м — %.0f %%, 13-16 м — %.0f %%, шире 16 м — %.0f %%'
      % ((w < 13).mean() * 100, ((w >= 13) & (w <= 16)).mean() * 100, (w > 16).mean() * 100))
