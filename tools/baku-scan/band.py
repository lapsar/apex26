#!/usr/bin/env python3
"""Полотно Баку по снимку: кромки слева и справа от контура (порт hungaroring-scan/halfwidth.py).
Профиль ±RNG м поперёк контура, асфальт — серый, не трава и не бетон; полотно — самая длинная тёмная
полоса, накрывающая контур или ближайшая к нему; края уточняются по белой линии (±1.2 м).
Машины на улицах рвут полосу — поэтому сырые станции потом чистятся (recenter.py), а спорные места
смотрятся глазами (view.py).

    python3 band.py [--step=5] [--src=google] [--z=20]   -> band.tsv (S, левая, правая кромка; + влево)
"""
import sys, numpy as np, concurrent.futures as cf
import bk, tiles
SRC = next((a.split('=')[1] for a in sys.argv if a.startswith('--src=')), 'google')
Z = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--z=')), 20))
DS = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 5))
RNG, PS, GAP = 16.0, 0.1, 0.6


def rgb(x, y):
    la, lo = bk.latlon(x, y); return tiles.px(la, lo, SRC, Z)


def band(S):
    p, t = bk.at(S); n = (-t[1], t[0])
    ds = np.arange(-RNG, RNG + 1e-9, PS)
    col = np.array([rgb(p[0] + n[0] * d, p[1] + n[1] * d) for d in ds], float)
    v = col.mean(1); sat = col.max(1) - col.min(1)
    dark = (v > 45) & (v < 135) & (sat < 34)
    # разметка полос (белые штрихи 0.15–0.2 м, на снимке до 0.5 м) не рвёт полотно: дыры до GAP склеиваются
    i = 0
    while i < len(dark):
        if not dark[i]:
            j = i
            while j + 1 < len(dark) and not dark[j + 1]: j += 1
            if i > 0 and j + 1 < len(dark) and (j - i + 1) * PS <= GAP: dark[i:j + 1] = True
            i = j + 1
        else: i += 1
    runs, i = [], 0
    while i < len(dark):
        if dark[i]:
            j = i
            while j + 1 < len(dark) and dark[j + 1]: j += 1
            if (j - i) * PS >= 4.0: runs.append((i, j))
            i = j + 1
        else: i += 1
    if not runs: return (S, None, None)
    k = min(range(len(runs)), key=lambda q: 0 if ds[runs[q][0]] <= 0 <= ds[runs[q][1]] else min(abs(ds[runs[q][0]]), abs(ds[runs[q][1]])))
    a, b = runs[k]

    def refine(idx):
        lo, hi = max(0, idx - 12), min(len(ds) - 1, idx + 12); best, bi = 0, idx
        for q in range(lo, hi + 1):
            if v[q] >= 140 and sat[q] <= 50 and v[q] > best: best, bi = v[q], q
        return ds[bi]
    return (S, refine(b), refine(a))


if __name__ == '__main__':
    st = list(np.arange(0, bk.TOT, DS))
    # тайлы качаются параллельно: сначала прогреть кэш по сетке станций
    with cf.ThreadPoolExecutor(8) as ex: rows = list(ex.map(band, st))
    open('band.tsv', 'w').write('S\tleft\tright\n' + ''.join('%.1f\t%s\t%s\n' % (s, '' if l is None else '%.2f' % l, '' if r is None else '%.2f' % r) for s, l, r in rows))
    got = [(s, l, r) for s, l, r in rows if l is not None]
    w = np.array([l - r for s, l, r in got]); c = np.array([(l + r) / 2 for s, l, r in got])
    print('станций %d, полотно найдено %d; ширина медиана %.1f (10%% %.1f, 90%% %.1f); середина от контура медиана %+.1f (10%% %+.1f, 90%% %+.1f)'
          % (len(rows), len(got), np.median(w), np.percentile(w, 10), np.percentile(w, 90), np.median(c), np.percentile(c, 10), np.percentile(c, 90)))
