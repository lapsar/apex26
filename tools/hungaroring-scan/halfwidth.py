#!/usr/bin/env python3
"""Ширина полотна Хунгароринга и СДВИГ КОНТУРА от середины дороги — по спутнику.

ЗАЧЕМ ОТДЕЛЬНО ОТ МАЙАМИ. Там кромка искалась «белой линией» начиная с 3.5 м
от осевой, потому что контур заведомо шёл по середине. У Хунгароринга это
неверно: контур `bacinger/hu-1986` лежит НЕ на середине полотна, и поиск,
начинающийся в трёх метрах, проскакивает ближнюю кромку и ловит поребрик или
край зоны вылета. Поэтому здесь профиль читается от −18 до +18 м и полотно
ищется как САМАЯ ДЛИННАЯ ТЁМНАЯ ПОЛОСА рядом с контуром, а белые линии только
уточняют её края.

    python3 halfwidth.py                 # весь круг, Google z20
    python3 halfwidth.py --step=20 --src=esri --z=19
"""
import json, sys
import numpy as np
from prof import at, rgb, TOT, SF

SRC = next((a.split('=')[1] for a in sys.argv if a.startswith('--src=')), 'google')
Z = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--z=')), 20))
DS = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 10))
RNG, PS = 18.0, 0.1


def band(p, n):
    """(левая кромка, правая кромка) в метрах от контура; None, если не нашлось"""
    ds = np.arange(-RNG, RNG + 1e-9, PS)
    col = [rgb(p[0] + n[0] * d, p[1] + n[1] * d, SRC, Z) for d in ds]
    v = np.array([sum(c) / 3 for c in col])
    sat = np.array([max(c) - min(c) for c in col])
    dark = (v > 60) & (v < 132) & (sat < 34)          # асфальт: серый, не трава и не бетон
    # самая длинная тёмная полоса, накрывающая контур или ближайшая к нему
    runs, i = [], 0
    while i < len(dark):
        if dark[i]:
            j = i
            while j + 1 < len(dark) and dark[j + 1]:
                j += 1
            if (j - i) * PS >= 6.0:
                runs.append((i, j))
            i = j + 1
        else:
            i += 1
    if not runs:
        return None
    k = min(range(len(runs)), key=lambda q: abs((ds[runs[q][0]] + ds[runs[q][1]]) / 2))
    a, b = runs[k]
    # уточнение по белой линии на краю полосы: ищем самый яркий неокрашенный пиксель в ±1.2 м
    def refine(idx, side):
        lo, hi = max(0, idx - 12), min(len(ds) - 1, idx + 12)
        best, bi = 0, idx
        for q in range(lo, hi + 1):
            if v[q] >= 140 and sat[q] <= 50 and v[q] > best:
                best, bi = v[q], q
        return ds[bi]
    return refine(b, +1), refine(a, -1)      # b — больший d (левее), a — меньший (правее)


rows = []
for S in range(0, int(TOT), DS):
    p, t = at(SF + S); n = [-t[1], t[0]]
    e = band(p, n)
    if e:
        rows.append((S, e[0], e[1]))
json.dump(rows, open('edges.json', 'w'))

L = np.array([r[1] for r in rows]); R = np.array([r[2] for r in rows])
w = L - R
c = (L + R) / 2
print('снимок %s z%d, шаг %d м: полотно найдено на %d станциях из %d'
      % (SRC, Z, DS, len(rows), int(TOT) // DS + 1))
print('ШИРИНА: медиана %.1f м  10%%=%.1f 25%%=%.1f 75%%=%.1f 90%%=%.1f'
      % (np.median(w), *[np.percentile(w, q) for q in (10, 25, 75, 90)]))
print('доля круга: уже 12 м — %.0f %%, 12-15 м — %.0f %%, шире 15 м — %.0f %%'
      % ((w < 12).mean() * 100, ((w >= 12) & (w <= 15)).mean() * 100, (w > 15).mean() * 100))
print('СДВИГ КОНТУРА от середины полотна (+ влево по ходу): медиана %+.1f м, '
      '10%%=%+.1f 90%%=%+.1f, худший %.1f м'
      % (np.median(c), np.percentile(c, 10), np.percentile(c, 90), np.abs(c).max()))
