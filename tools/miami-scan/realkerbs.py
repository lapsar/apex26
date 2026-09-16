#!/usr/bin/env python3
"""ПОПЫТКА найти настоящие поребрики Майами по снимку — и почему она НЕ РАБОТАЕТ.

Оставлено как предупреждение, чтобы не писать это заново. Замысел простой:
поребрик красно-белый, значит искать красный пиксель в полосе 3.5-12 м от осевой.

На деле признак ложный. Поребрик шириной около метра, полосы чередуются через
полметра, а лучший доступный снимок даёт 0.13 м/пиксель (Google z20) — красное
и белое смешиваются в розовато-серый. Порог, который ловит поребрик, ловит
заодно рыжую траву, песок и оранжевые конусы: прогон 09.2026 нашёл 44 куска,
и половина из них на ПРЯМЫХ, где поребрика быть не может. Согласие с тем, что
строит игра, вышло 2 % — это шум, а не замер.

Чем мерить вместо этого:
  * расстановку поребриков в игре — по геометрии (`kerbs.js` + `gaps.py` в песочнице
    или прямо по track.kerbL/kerbR): «есть ли поворот без поребрика с внутренней
    стороны» отвечается точно и без снимка;
  * настоящую линию поребрика — так же, как барьер Монреаля: развёрткой круга
    в ленту и трассировкой по ней (tools/montreal-scan/unroll.py, trace.py),
    где полосатость видна как чередование вдоль кромки, а не как цвет точки.
"""

import json, math, sys
import numpy as np
from prof import at, rgb, TOT, SF

def reddish(c):
    r, g, b = c
    return r > 95 and r - g > 28 and r - b > 28          # красная секция поребрика

def has_kerb(S, side, lo=4.0, hi=12.0, step=0.2):
    p, t = at(SF + S); n = [-t[1], t[0]]
    d = lo
    hits = 0
    while d < hi:
        if reddish(rgb(p[0] + n[0] * side * d, p[1] + n[1] * side * d)): hits += 1
        d += step
    return hits

STEP = 4
rows = []
for S in range(0, int(TOT), STEP):
    rows.append((S, has_kerb(S, -1), has_kerb(S, 1)))
json.dump(rows, open('real_kerbs.json', 'w'))

def runs(flag):
    out = []; n = len(rows); i = 0
    while i < n:
        if flag[i] and not flag[i - 1]:
            L = 0
            while L < n and flag[(i + L) % n]: L += 1
            out.append((rows[i][0], rows[i][0] + L * STEP, L * STEP)); i += L
        else: i += 1
    return out
L = [r[1] >= 2 for r in rows]; R = [r[2] >= 2 for r in rows]
for name, fl in (('СЛЕВА', L), ('СПРАВА', R)):
    rr = [x for x in runs(fl) if x[2] >= 12]
    print('%s: %d кусков длиннее 12 м, всего %d м' % (name, len(rr), sum(x[2] for x in rr)))
    print('  ' + '  '.join('%d..%d (%d)' % x for x in rr))
