#!/usr/bin/env python3
"""Что телеметрия openf1 говорит про дорогу ПОПЕРЁК — и почему ей тут верить нельзя.

Скрипт совмещает большую выгрузку положений (fetch-openf1-bulk.py) с нашим
контуром и печатает огибающую: где ездили крайние слева и крайние справа.
Ключ --check запускает две проверки самого ИСТОЧНИКА, и их результат важнее
самой огибающей.

    python3 fetch-openf1-bulk.py 11342 2026-07-26T13:03:20 2026-07-26T13:18:00 bulk_race.json
    python3 openf1-road.py bulk_race.json            # подобрать совмещение и напечатать
    python3 openf1-road.py bulk_fp1.json --use-fit   # взять готовое совмещение
    python3 openf1-road.py bulk_race.json --check    # можно ли верить поперечной координате

ГЛАВНЫЙ ВЫВОД ЗАМЕРА (09.2026, Хунгароринг и Майами дали одно и то же):
поперечной координате верить НЕЛЬЗЯ. Поток `location` хорошо несёт расстояние
ВДОЛЬ трассы и почти не несёт положение ПОПЕРЁК неё:
  * за 30 минут FP1 всеми пилотами использованный коридор шириной 0.8 м
    по медиане (мин/макс, а не проценты) — все «едут по одной нитке»;
  * 2.7-2.9 % кадро-болидов гонки имеют соседа ближе 2 м, чего быть не может:
    болид 5.6 x 2.0 м. Проверка не зависит ни от какого совмещения;
  * 98.8 % пар, стоящих бок о бок (меньше 5 м вдоль дороги), разведены поперёк
    меньше чем на ширину болида, медиана 13 см;
  * 22 стоящих на решётке болида ложатся на ПРЯМУЮ с разбросом 0.69 м, без
    зигзага ±2 м, который у настоящих клеток есть.
Отсюда: линию старта и шаг решётки телеметрия меряет отлично (см. openf1-grid.py),
а вопрос «где середина дороги» она НЕ закрывает — её путь расходится с серединой
полотна по снимку на медиану 3.35 м при корреляции −0.10.
"""
import json, math, os, sys, collections
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

GEO = os.environ.get('HUNGARO_GEOJSON', os.path.join(HERE, 'hu-1986.geojson'))
R = np.array(to_metres(coords(GEO)))
A = R
B = np.vstack([R[1:], R[:1]])
V = B - A
L = np.hypot(V[:, 0], V[:, 1])
L2 = np.maximum(L ** 2, 1e-9)
CUM = np.concatenate([[0], np.cumsum(L)])
TOT = CUM[-1]
FITF = os.path.join(HERE, 'openf1_fit.json')


def project(P):
    """P: (n,2) -> (S вдоль контура, боковой отступ со знаком «влево», невязка)."""
    S = np.empty(len(P)); O = np.empty(len(P)); D = np.empty(len(P))
    for k in range(0, len(P), 2000):
        p = P[k:k + 2000]
        t = np.clip(((p[:, None, :] - A[None]) * V[None]).sum(2) / L2[None], 0, 1)
        Q = A[None] + V[None] * t[..., None]
        W = p[:, None, :] - Q
        d = np.hypot(W[..., 0], W[..., 1])
        i = d.argmin(1)
        r = np.arange(len(p))
        S[k:k + 2000] = CUM[i] + t[r, i] * L[i]
        D[k:k + 2000] = d[r, i]
        n = V[i] / L[i][:, None]
        O[k:k + 2000] = n[:, 0] * W[r, i, 1] - n[:, 1] * W[r, i, 0]
    return S, O, D


def fit(F):
    """Подбор угла и сдвига: минимум средней невязки до контура.

    ВАЖНО: подбирать можно только по куску, где болиды ЕДУТ. На решётке или
    в боксах точки стоят на месте и подбор уходит в мусор (проверено: угол 285°,
    невязка 36 м).
    """
    Fc = F - F.mean(0)
    sub = Fc[::max(1, len(Fc) // 3000)]

    def err(deg, off):
        th = math.radians(deg); c, s = math.cos(th), math.sin(th)
        W = sub @ np.array([[c, -s], [s, c]]).T + off + R.mean(0)
        return float(project(W)[2].mean())

    bd = min(((err(g, np.zeros(2)), g) for g in np.arange(0, 360, 0.5)))[1]
    bo = np.zeros(2); be = err(bd, bo)
    for it in range(5):
        ds, dl = 0.5 / 2 ** it, 8.0 / 2 ** it
        moved = True
        while moved:
            moved = False
            for dd in (-ds, 0, ds):
                for dx in (-dl, 0, dl):
                    for dy in (-dl, 0, dl):
                        if dd == dx == dy == 0:
                            continue
                        e = err(bd + dd, bo + np.array([dx, dy]))
                        if e < be - 1e-4:
                            be, bd, bo = e, bd + dd, bo + np.array([dx, dy]); moved = True
    return bd, bo, be, F.mean(0)


def to_world(F, bd, bo, mean):
    th = math.radians(bd); c, s = math.cos(th), math.sin(th)
    return (F - mean) @ np.array([[c, -s], [s, c]]).T + bo + R.mean(0)


def check(raw):
    """Две проверки источника. Первая НЕ зависит ни от какого совмещения."""
    g = collections.defaultdict(list)
    for dn, d, x, y, z in raw:
        g[d].append((dn, x * 0.1, y * 0.1))
    near = []
    for v in g.values():
        if len(v) < 2:
            continue
        P = np.array([[a[1], a[2]] for a in v])
        D = np.hypot(P[:, 0, None] - P[None, :, 0], P[:, 1, None] - P[None, :, 1])
        np.fill_diagonal(D, 1e9)
        near += list(D.min(1))
    n = np.array(near)
    print('ПРОВЕРКА 1 (без всякого совмещения): расстояние до ближайшего соседа')
    print('  кадро-болидов %d, медиана %.1f м' % (len(n), np.median(n)))
    for t in (0.5, 2.0):
        print('  ближе %.1f м: %.2f %% — так стоять не могут, болид 5.6 x 2.0 м'
              % (t, 100 * (n < t).mean()))
    print('  ближе 6.0 м (длина болида): %.2f %%' % (100 * (n < 6.0).mean()))
    return n


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    files = args or ['bulk_race.json']
    reuse = '--use-fit' in sys.argv
    raw = []
    for f in files:
        raw += json.load(open(f))
    print('точек %d из %d файлов' % (len(raw), len(files)))
    if '--check' in sys.argv:
        check(raw)
    F = np.array([[p[2], p[3]] for p in raw], float) * 0.1
    if reuse:
        j = json.load(open(FITF))
        bd, bo, mean = j['deg'], np.array(j['off']), np.array(j['mean'])
        print('совмещение готовое: угол %.3f°, сдвиг (%.1f, %.1f)' % (bd, bo[0], bo[1]))
    else:
        bd, bo, be, mean = fit(F)
        print('совмещение: угол %.3f°, сдвиг (%.1f, %.1f), средняя невязка %.2f м'
              % (bd, bo[0], bo[1], be))
        json.dump(dict(deg=bd, off=list(bo), mean=list(mean)), open(FITF, 'w'))
    S, O, D = project(to_world(F, bd, bo, mean))

    if '--check' in sys.argv:
        dt = [p[1][11:21] for p in raw]
        g = collections.defaultdict(list)
        for k in range(len(raw)):
            g[dt[k]].append((S[k], O[k]))
        res = []
        for v in g.values():
            for i in range(len(v)):
                for k in range(i + 1, len(v)):
                    if abs(v[i][0] - v[k][0]) < 5.0 and abs(v[i][1] - v[k][1]) < 20:
                        res.append(abs(v[i][1] - v[k][1]))
        if res:
            r = np.array(res)
            print('ПРОВЕРКА 2: пары БОК О БОК (меньше 5 м вдоль дороги), %d штук' % len(r))
            print('  разведены поперёк: медиана %.2f м; уже ширины болида (2.57 м) — %.1f %%'
                  % (np.median(r), 100 * (r < 2.57).mean()))

    STEP = 10.0
    n = int(TOT // STEP) + 1
    idx = np.clip((S / STEP).astype(int), 0, n - 1)
    rows = []
    for i in range(n):
        o = O[idx == i]
        if len(o) < 60:
            continue
        rows.append((i * STEP, o.min(), o.max(), 0.5 * (o.min() + o.max()), float(o.max() - o.min()), len(o)))
    mid = np.array([r[3] for r in rows]); wid = np.array([r[4] for r in rows])
    print('станций с данными: %d из %d' % (len(rows), n))
    print('ИСПОЛЬЗУЕМАЯ ширина (мин/макс на станции): медиана %.1f м, четверти %.1f/%.1f'
          % (np.median(wid), np.percentile(wid, 25), np.percentile(wid, 75)))
    print('  — если она заметно уже полотна, поперечной координате верить нельзя')
    print('путь телеметрии относительно нашего контура: медиана %+.2f м, %.2f..%+.2f'
          % (np.median(mid), mid.min(), mid.max()))


if __name__ == '__main__':
    main()
