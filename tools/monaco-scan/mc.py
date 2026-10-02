#!/usr/bin/env python3
"""Контур Монако (bacinger mc-1929) в метрах — тем же переводом, что вшит в игру
(lat0/lon0 = среднее точек без дубля; x=(lon-lon0)*111320*cos(lat0), y=(lat-lat0)*110540).
Здесь x,y — ГЕОГРАФИЧЕСКИЕ метры (восток, север); игра отражает X (V3(-x,0,y)).

    from mc import R, TOT, at, xy, latlon, proj
"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
GEO = os.environ.get('MC_GEOJSON', os.path.join(HERE, 'mc-1929.geojson'))
_g = json.load(open(GEO if os.path.isabs(GEO) else os.path.join(HERE, GEO)))['features'][0]['geometry']['coordinates']
_g = _g[:-1] if _g[0] == _g[-1] else _g
LAT0 = sum(p[1] for p in _g) / len(_g)
LON0 = sum(p[0] for p in _g) / len(_g)
MPD_LON = 111320 * math.cos(math.radians(LAT0)); MPD_LAT = 110540
R = [((p[0] - LON0) * MPD_LON, (p[1] - LAT0) * MPD_LAT) for p in _g]
CUM = [0.0]
for i in range(len(R)):
    CUM.append(CUM[-1] + math.dist(R[i], R[(i + 1) % len(R)]))
TOT = CUM[-1]
SF_GAME = 2460   # sfShift в spec игры (по сплайну)


def xy(lat, lon): return ((lon - LON0) * MPD_LON, (lat - LAT0) * MPD_LAT)
def latlon(x, y): return (LAT0 + y / MPD_LAT, LON0 + x / MPD_LON)


def at(S, P=R, C=CUM):
    """точка и единичный касательный вектор ломаной P на дуге S от её начала"""
    T = C[-1]; S %= T
    for i in range(len(P)):
        if C[i] <= S <= C[i + 1]:
            a, b = P[i], P[(i + 1) % len(P)]; t = (S - C[i]) / max(1e-9, C[i + 1] - C[i])
            d = (b[0] - a[0], b[1] - a[1]); L = math.hypot(*d)
            return (a[0] + d[0] * t, a[1] + d[1] * t), (d[0] / L, d[1] / L)


def proj(q, P=R, C=None):
    """ближайшая точка ломаной: (S, боковой сдвиг: + влево по ходу, расстояние)"""
    if C is None:
        C = [0.0]
        for i in range(len(P)): C.append(C[-1] + math.dist(P[i], P[(i + 1) % len(P)]))
    best = None
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2))
        px, py = a[0] + dx * t, a[1] + dy * t
        d = math.hypot(q[0] - px, q[1] - py)
        if best is None or d < best[2]:
            L = math.sqrt(L2); side = (dx * (q[1] - py) - dy * (q[0] - px)) / L
            best = (C[i] + t * L, side, d)
    return best
