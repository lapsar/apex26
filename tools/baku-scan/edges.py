#!/usr/bin/env python3
"""Кромки полотна Баку: черновик по OSM (corridor.tsv) + ручные поправки (edges_fix.tsv) -> edges.tsv.
Черновик: кромка = линия тротуара OSM (рисуется по бордюру или чуть дальше — в замке между ними 6.5 м при 7.6 м
настоящих между белыми линиями); нет тротуара — стена дома/крепостная стена минус SIDEWALK; пропуски — интерполяцией
по кругу, медиана по 9 станциям. Поправки — участки S0..S1 с заданными L и R (метры от контура, + влево), по снимку
и онбоарду (они главнее черновика); значение 'x:y' — плавный переход по участку. Знак: L > 0 > R.

    python3 edges.py      -> edges.tsv (S, L, R, источник)
"""
import numpy as np, bk
SIDEWALK = 2.5
R = [l.split('\t') for l in open('corridor.tsv').read().splitlines()[1:]]
f = lambda v: float(v) if v else np.nan
S = np.array([float(r[0]) for r in R]); bl, br, sl, sr = (np.array([f(r[i]) for r in R]) for i in (1, 2, 3, 4))
BMAX = 11.0                     # дом дальше — улица шире, чем видно по домам (проспект с бульваром): не мерка
L = np.where(np.isnan(sl), np.where(bl < BMAX, bl - SIDEWALK, np.nan), sl)
Rr = -np.where(np.isnan(sr), np.where(br < BMAX, br - SIDEWALK, np.nan), sr)
DEF = 6.5                        # нет ни тротуара, ни близкого дома дальше GAP м — полотно 13 м по контуру, до поправки
GAP = 40.0


def fill(v, sign):
    ok = ~np.isnan(v); T = bk.TOT
    idx = np.where(ok)[0]
    for i in np.where(~ok)[0]:                       # далеко от мерки — полуширина по умолчанию
        d = np.min(np.abs((S[idx] - S[i] + T / 2) % T - T / 2)) if len(idx) else 1e9
        if d > GAP: v[i] = sign * DEF
    ok = ~np.isnan(v)
    xs = np.concatenate([S[ok] - T, S[ok], S[ok] + T]); ys = np.tile(v[ok], 3)
    return np.interp(S, xs, ys)


def med(v, n=9):
    h = n // 2; return np.array([np.median(np.take(v, range(i - h, i + h + 1), mode='wrap')) for i in range(len(v))])


L = med(fill(L, 1)); Rr = med(fill(Rr, -1)); src = ['osm'] * len(S)
try:
    for l in open('edges_fix.tsv'):
        if l.startswith('#') or not l.strip(): continue
        a, b, lv, rv = l.split('\t')[:4]; a, b = float(a), float(b)
        m = (S >= a) & (S <= b) if a <= b else (S >= a) | (S <= b)
        idx = np.where(m)[0]; u = ((S[idx] - a) % bk.TOT) / max(1e-9, (b - a) % bk.TOT)   # доля пути по участку
        for arr, v in ((L, lv), (Rr, rv)):                 # 'x' — постоянно, 'x:y' — плавно от x к y по участку
            if not v.strip(): continue
            p = [float(q) for q in v.split(':')]
            arr[idx] = p[0] if len(p) == 1 else p[0] + (p[1] - p[0]) * u
        for i in np.where(m)[0]: src[i] = 'fix'
except FileNotFoundError: pass
SMOOTH = 5                       # ступеньки между участками поправок: скользящее среднее по 5 станциям (25 м) — у настоящих
                                 # отбойников подход к сужению тоже плавный; узкие места (замок) от этого не уже и не шире на прямых кусках
def avg(v, n=SMOOTH):
    h = n // 2; return np.array([np.mean(np.take(v, range(i - h, i + h + 1), mode='wrap')) for i in range(len(v))])
L = avg(L); Rr = avg(Rr)
open('edges.tsv', 'w').write('S\tL\tR\tsrc\n' + ''.join('%.1f\t%.2f\t%.2f\t%s\n' % (s, l, r, c) for s, l, r, c in zip(S, L, Rr, src)))
w = L - Rr; print('edges.tsv: ширина медиана %.1f (мин %.1f, макс %.1f); поправок %d станций' % (np.median(w), w.min(), w.max(), src.count('fix')))
