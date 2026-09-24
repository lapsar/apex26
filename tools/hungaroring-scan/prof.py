#!/usr/bin/env python3
"""Осевая Хунгароринга в метрах + профиль снимка поперёк полотна.

Импортируется другими скриптами набора; при запуске печатает профиль яркости
в заданных точках круга (метры от линии старта):

    python3 prof.py 100 2600 3500
"""
import json, math, os, sys
import tiles

HERE = os.path.dirname(os.path.abspath(__file__))
CIRC = os.environ.get('HUNGARO_GEOJSON', os.path.join(HERE, 'hu-1986.geojson'))
SF = float(os.environ.get('HUNGARO_SF', 4119.1))
# 4119.1 — ЛИНИЯ СТАРТА (передний край решётки). Финишная линия Хунгароринга ОТДЕЛЬНАЯ
# и стоит на 38.6 м раньше; какая из них какая — доказано арифметикой дистанции гонки,
# см. README. Переменные HUNGARO_GEOJSON и HUNGARO_SF позволяют натравить набор
# на ДРУГУЮ трассу — так сверяются мерки на тех, где ответ известен.

_geo = json.load(open(CIRC))
_gc = _geo['features'][0]['geometry']['coordinates']
_gc = _gc[:-1] if _gc[0] == _gc[-1] else _gc
LAT0 = sum(p[1] for p in _gc) / len(_gc)
LON0 = sum(p[0] for p in _gc) / len(_gc)
MPD_LON = 111320 * math.cos(math.radians(LAT0))
MPD_LAT = 110540
R = [[(p[0] - LON0) * MPD_LON, (p[1] - LAT0) * MPD_LAT] for p in _gc]
CUM = [0]
for i in range(len(R)):
    a, b = R[i], R[(i + 1) % len(R)]
    CUM.append(CUM[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
TOT = CUM[-1]


def at(S):
    """точка осевой и единичный вектор вдоль трассы на дистанции S от НАЧАЛА КОНТУРА"""
    S %= TOT
    for i in range(len(R)):
        if CUM[i] <= S <= CUM[i + 1]:
            t = (S - CUM[i]) / max(1e-9, CUM[i + 1] - CUM[i])
            a, b = R[i], R[(i + 1) % len(R)]
            p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            d = [b[0] - a[0], b[1] - a[1]]; L = math.hypot(*d)
            return p, [d[0] / L, d[1] / L]
    return R[0], [1, 0]


def latlon(x, y):
    return LAT0 + y / MPD_LAT, LON0 + x / MPD_LON


def rgb(x, y, src='esri', z=19):
    la, lo = latlon(x, y)
    return tiles.px(la, lo, src, z)


def profile(S_from_start, src='esri', rng=24, step=0.3, z=19):
    p, t = at(SF + S_from_start); n = [-t[1], t[0]]
    out = []
    d = -rng
    while d <= rng:
        out.append((round(d, 1), rgb(p[0] + n[0] * d, p[1] + n[1] * d, src, z)))
        d += step
    return out


if __name__ == '__main__':
    src = next((a.split('=')[1] for a in sys.argv if a.startswith('--src=')), 'esri')
    z = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--z=')), 19))
    for S in [int(a) for a in sys.argv[1:] if not a.startswith('--')] or [100]:
        print('=== S=%d м от линии старта (%s z%d)' % (S, src, z))
        for d, c in profile(S, src, z=z):
            print('  %+6.1f  %3d,%3d,%3d %s' % (d, c[0], c[1], c[2], '#' * int(sum(c) / 24)))
