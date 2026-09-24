#!/usr/bin/env python3
"""Точка разметки по месту на круге: S, сторона, отступ от осевой -> [lat, lon].

Разметка окружения задаётся и через S, и через координаты (строитель пересчитывает
S из координат в окне ±60 м, docs/notes/tracks/overview.md, урок 1). Эта справка
строит координаты ПО ОСЕВОЙ ИГРЫ, так что точка ложится ровно туда, где её меряли
на развёртке снимка вдоль той же осевой.

    node dump-cl.js                       # centerline.json с P, R, S
    python3 standpos.py 4045 L 24         # -> [47.581234,19.254321]

Перевод обратный scenXZ из index.html: x = -(lon-lon0)*mlon, z = (lat-lat0)*110540.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=47.582732616, lon0=19.250829443, mlon=75088.112675)   # SCEN_ORIGIN.Hungaroring
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); L = cl['len']


def latlon(s, side, off):
    s %= L
    i = int(np.searchsorted(S, s, side='right') - 1); j = (i + 1) % len(S)
    f = (s - S[i]) / (((S[j] - S[i]) % L) or 1e-9)
    p = P[i] * (1 - f) + P[j] * f; r = R[i] * (1 - f) + R[j] * f; r /= np.linalg.norm(r)
    x, z = p + r * off * (1 if side == 'R' else -1)
    return float(round(O["lat0"] + z / 110540, 6)), float(round(O["lon0"] - x / O["mlon"], 6))


if __name__ == '__main__':
    a = sys.argv[1:]
    for k in range(0, len(a), 3):
        print(list(latlon(float(a[k]), a[k+1], float(a[k+2]))))
