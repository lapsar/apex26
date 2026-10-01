#!/usr/bin/env python3
"""Ширина полотна Монако и сдвиг контура mc-1929 от середины дороги — по снимку.
Порт tools/hungaroring-scan/halfwidth.py: профиль поперёк от −RNG до +RNG м, полотно —
самая длинная серая полоса, накрывающая контур или ближайшая к нему; края уточняются
по белой линии. Улицы Монако с тенями домов и машинами — мерка грубее, чем на автодроме:
СМОТРЕТЬ РЕЗУЛЬТАТ ГЛАЗАМИ (view.py --extra=hw_edges.tsv).

НА УЛИЦАХ МОНАКО НЕ РАБОТАЕТ (замер 01.10.2026): полотно найдено на 3 станциях из 663.
Профиль поперёк улицы — машины на стоянке, разметка, тени домов, тротуары того же тона;
«самой длинной серой полосы» там нет. Середина дороги взята по OSM (osmoff.py, sidewalk.py).
Скрипт оставлен как отрицательный результат — чтобы не писать его в третий раз.

    python3 halfwidth.py [--step=5] [--src=google] [--z=20]   -> hw.tsv, hw_edges.tsv
"""
import sys, numpy as np, mc, tiles
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
SRC = opt.get('src', 'google'); Z = int(opt.get('z', 20)); DS = float(opt.get('step', 5))
RNG, PS = 14.0, 0.1


def band(p, n):
    ds = np.arange(-RNG, RNG + 1e-9, PS)
    col = [tiles.px(*mc.latlon(p[0] + n[0] * d, p[1] + n[1] * d), SRC, Z) for d in ds]
    v = np.array([sum(c) / 3 for c in col]); sat = np.array([max(c) - min(c) for c in col])
    dark = (v > 35) & (v < 135) & (sat < 30)
    runs, i = [], 0
    while i < len(dark):
        if dark[i]:
            j = i
            while j + 1 < len(dark) and dark[j + 1]: j += 1
            if (j - i) * PS >= 5.0: runs.append((i, j))
            i = j + 1
        else: i += 1
    if not runs: return None
    k = min(range(len(runs)), key=lambda q: 0 if ds[runs[q][0]] <= 0 <= ds[runs[q][1]] else min(abs(ds[runs[q][0]]), abs(ds[runs[q][1]])))
    a, b = runs[k]
    return ds[b], ds[a]          # левый край (+), правый (−)


rows, edges = [], []
S = 0.0
while S < mc.TOT:
    p, t = mc.at(S); n = (-t[1], t[0])
    e = band(p, n)
    if e:
        rows.append((S, e[0], e[1]))
        for d in e: edges.append((p[0] + n[0] * d, p[1] + n[1] * d))
    S += DS
open('hw.tsv', 'w').write('S\tleft\tright\twidth\tcentre\n' + ''.join('%.1f\t%.2f\t%.2f\t%.2f\t%.2f\n' % (s, l, r, l - r, (l + r) / 2) for s, l, r in rows))
open('hw_edges.tsv', 'w').write(''.join('%.2f %.2f\n' % q for q in edges))
w = np.array([l - r for _, l, r in rows]); c = np.array([(l + r) / 2 for _, l, r in rows])
print('станций %d из %d; ширина медиана %.1f (10%% %.1f, 90%% %.1f); центр от контура медиана %+.1f (10%% %+.1f, 90%% %+.1f)'
      % (len(rows), int(mc.TOT / DS), np.median(w), np.percentile(w, 10), np.percentile(w, 90), np.median(c), np.percentile(c, 10), np.percentile(c, 90)))
