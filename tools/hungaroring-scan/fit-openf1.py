#!/usr/bin/env python3
"""Совмещение НАСТОЯЩЕГО круга телеметрии (openf1.org) с нашим контуром.

Это ВТОРОЙ, независимый источник линии старта: multiviewer отдаёт официальный
круг 2021 года, openf1 — живую телеметрию 2023+. Системы координат у них разные,
поэтому совпадение sfShift из двух источников — не тавтология, а сверка.

    python3 ../openf1-lap.py Hungaroring      # положит hungaroring_lap.json
    python3 fit-openf1.py hungaroring_lap.json

Печатает: угол и сдвиг совмещения, среднюю ошибку, S первой точки круга
(она же линия старта), отход настоящей гоночной линии от нашей осевой.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

LAP = sys.argv[1] if len(sys.argv) > 1 else 'hungaroring_lap.json'
GEO = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'hu-1986.geojson')

R = np.array(to_metres(coords(GEO)))
cum = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.vstack([R, R[:1]]), axis=0).T))])
TOT = cum[-1]


def proj(pt):
    A, B = R, np.vstack([R[1:], R[:1]])
    V = B - A; L2 = (V**2).sum(1); L2[L2 == 0] = 1e-9
    t = np.clip(((pt - A) * V).sum(1) / L2, 0, 1)
    P = A + V * t[:, None]
    d = np.hypot(*(pt - P).T)
    i = int(np.argmin(d))
    # знак отступа: слева/справа от направления движения
    V0 = V[i] / max(1e-9, np.hypot(*V[i]))
    sgn = np.sign(V0[0]*(pt-P[i])[1] - V0[1]*(pt-P[i])[0])
    return d[i], cum[i] + t[i] * np.hypot(*V[i]), sgn


d = json.load(open(LAP))
F = np.array([[p['x'], p['y']] for p in d['location']], float) * 0.1
Fc = F - F.mean(0)


def err(deg, off, step=3):
    th = math.radians(deg); c, s = math.cos(th), math.sin(th)
    Fr = Fc @ np.array([[c, -s], [s, c]]).T + off
    return float(np.mean([proj(p + R.mean(0))[0] for p in Fr[::step]]))


best = min(((err(g, np.zeros(2), 6), g) for g in np.arange(0, 360, 0.25)))
bd, bo, be = best[1], np.zeros(2), best[0]
for it in range(4):
    ds, os_ = 0.25 / 2**it, 4.0 / 2**it
    moved = True
    while moved:
        moved = False
        for dd in (-ds, 0, ds):
            for dx in (-os_, 0, os_):
                for dy in (-os_, 0, os_):
                    if dd == dx == dy == 0:
                        continue
                    e = err(bd + dd, bo + np.array([dx, dy]))
                    if e < be - 1e-4:
                        be, bd, bo = e, bd + dd, bo + np.array([dx, dy]); moved = True
print('%s %s, круг %.3f с' % (d['session']['circuit_short_name'], d['session']['year'],
                              d['lap']['lap_duration']))
print('совмещение: угол %.3f°, сдвиг (%.1f, %.1f), средняя ошибка %.2f м' % (bd, bo[0], bo[1], be))

th = math.radians(bd); c, s = math.cos(th), math.sin(th)
W = (F - F.mean(0)) @ np.array([[c, -s], [s, c]]).T + bo + R.mean(0)
dd, SF, _ = proj(W[0])
print('ЛИНИЯ СТАРТА: первая точка круга на S=%.1f м, отступ от осевой %.1f м' % (SF, dd))
print('  => sfShift = %d' % round(SF))

off = np.array([proj(p)[0] * proj(p)[2] for p in W])
print('гоночная линия: отход от осевой медиана %.1f м, наибольший %.1f м (влево %.1f, вправо %.1f)'
      % (float(np.median(np.abs(off))), float(np.abs(off).max()), off.max(), -off.min()))
z = np.array([p['z'] / 10.0 for p in d['location']])
print('высота %.1f..%.1f м, перепад %.2f м' % (z.min(), z.max(), z.max() - z.min()))
