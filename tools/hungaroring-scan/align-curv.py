#!/usr/bin/env python3
"""ГДЕ ЛИНИЯ СТАРТА: привязка круга телеметрии к контуру ПО КРИВИЗНЕ.

Зачем отдельный инструмент. Ригидное совмещение (miami-scan/f1fit.py) минимизирует
ПОПЕРЕЧНУЮ ошибку, а вдоль ПРЯМОЙ скольжение ничего не стоит: на главной прямой
Хунгароринга (950 м между T14 и T1) положение первой точки круга держится только
остальной геометрией петли — и два источника телеметрии разошлись там на 23 м.
Кривизна же — профиль с зубьями (каждый поворот пик), и его сдвиг ловится точнее.

    python3 align-curv.py hungaroring_lap.json          # ответ по Хунгарорингу
    python3 align-curv.py --check                       # СВЕРКА на трассах, где ответ известен

СВЕРКА ОБЯЗАТЕЛЬНА и делается на пяти трассах, уже вшитых в игру: их sfShift давно
подобран и проверен, значит инструмент обязан его воспроизвести. Без неё «ответ»
инструмента — это его собственная ошибка, а не измерение.

ДВЕ ЛОВУШКИ, обе стоили неверного числа:
  1. Точки положения идут через 16-25 м, и ломаная между ними даёт кривизну-мусор:
     без сглаживания пути пик уезжал на 3270 м и согласие падало до 0.75.
  2. Путь берётся ИНТЕГРАЛОМ СКОРОСТИ, а не суммой отрезков между точками: сумма
     отрезков завышает длину круга на 1.5 % (дрожание координат), и профиль растягивается.
"""
import json, math, os, sys, datetime
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

STEP = 2.0
SMOOTH = 60.0        # окно кривизны, м
PATH_SMOOTH = 9      # сглаживание пути телеметрии, точек по STEP м

# трассы для сверки: geojson и sfShift, стоящий в игре
CHECK = [('Monza', 'it-1922', 5440, 'monza_lap.json'),
         ('Silverstone', 'gb-1948', 3120, 'silverstone_lap.json'),
         ('Suzuka', 'jp-1962', 5690, 'suzuka_lap.json'),
         ('Montreal', 'ca-1978', 196, 'montreal_lap.json'),
         ('Miami', 'us-2022', 5274, 'miami_lap.json')]


def resample(P, cumP, step, total):
    S = np.arange(0, total, step)
    Q = np.vstack([P, P[:1]]) if len(cumP) == len(P) + 1 else P
    return S, np.stack([np.interp(S, cumP, Q[:, 0]), np.interp(S, cumP, Q[:, 1])], 1)


def smooth_pts(Q, w):
    n = len(Q); k = np.ones(w) / w
    out = []
    for c in (0, 1):
        v = np.concatenate([Q[-w:, c], Q[:, c], Q[:w, c]])
        out.append(np.convolve(v, k, 'same')[w:w + n])
    return np.stack(out, 1)


def curv(Q, step, smooth):
    n = len(Q); w = max(1, int(smooth / step / 2))
    h = np.arctan2(*np.diff(np.vstack([Q, Q[:1]]), axis=0).T[::-1])
    k = np.zeros(n)
    for i in range(n):
        a, b = h[(i - w) % n], h[(i + w) % n]
        k[i] = ((b - a + math.pi) % (2 * math.pi) - math.pi) / (2 * w * step)
    return k


def contour(geo):
    R = np.array(to_metres(coords(geo)))
    cum = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.vstack([R, R[:1]]), axis=0).T))])
    return R, cum, cum[-1]


def lap_profile(lapfile, TOT):
    d = json.load(open(lapfile))
    loc = d['location']
    t0 = datetime.datetime.fromisoformat(d['lap']['date_start'])
    lt = np.array([(datetime.datetime.fromisoformat(p['date']) - t0).total_seconds() for p in loc])
    F = np.array([[p['x'], p['y']] for p in loc], float) * 0.1
    car = d['car']
    ct = np.array([(datetime.datetime.fromisoformat(p['date']) - t0).total_seconds() for p in car])
    cv = np.array([p['speed'] / 3.6 for p in car])
    cd = np.concatenate([[0], np.cumsum((cv[1:] + cv[:-1]) / 2 * np.diff(ct))])
    cd -= np.interp(0.0, ct, cd)
    path = np.interp(lt, ct, cd)
    L = float(np.interp(d['lap']['lap_duration'], ct, cd))
    path *= TOT / L
    sel = (path >= 0) & (path <= TOT)
    _, Ft = resample(F[sel], path[sel], STEP, TOT)
    return d, curv(smooth_pts(Ft, PATH_SMOOTH), STEP, SMOOTH)


def align(geo, lapfile):
    R, cum, TOT = contour(geo)
    _, Qc = resample(R, cum, STEP, TOT)
    a = curv(smooth_pts(Qc, 5), STEP, SMOOTH)
    d, b = lap_profile(lapfile, TOT)
    best = None
    for sgn in (1, -1):
        aa = a - a.mean(); bb = sgn * b - (sgn * b).mean()
        n = len(aa)
        nrm = math.sqrt(float((aa**2).sum() * (bb**2).sum()))
        cc = np.array([float((aa * np.roll(bb, k)).sum()) for k in range(n)]) / nrm
        i = int(np.argmax(cc))
        y0, y1, y2 = cc[(i - 1) % n], cc[i], cc[(i + 1) % n]
        den = y0 - 2 * y1 + y2
        dx = 0.5 * (y0 - y2) / den if den < -1e-9 else 0.0
        dx = max(-1.0, min(1.0, dx))      # ЛОВУШКА: без зажима плоская вершина параболы
                                          # уводила ответ на сотни метров при том же согласии
        # ширина пика: где согласие падает вдвое от максимума
        half = 0
        while half < n // 2 and cc[(i + half) % n] > cc[i] / 2 and cc[(i - half) % n] > cc[i] / 2:
            half += 1
        if best is None or cc[i] > best[0]:
            best = (cc[i], ((i + dx) * STEP) % TOT, sgn, half * STEP, TOT, d)
    return best


if __name__ == '__main__':
    if '--check' in sys.argv:
        print('Сверка на трассах, где sfShift известен:')
        print('%-12s %8s %8s %8s %8s' % ('трасса', 'в игре', 'замер', 'ошибка', 'согласие'))
        errs = []
        for name, gid, sf, lap in CHECK:
            g = os.path.join(HERE, gid + '.geojson')
            lp = os.path.join(HERE, '..', lap)
            if not (os.path.exists(g) and os.path.exists(lp)):
                print('%-12s пропущена (нет %s или %s)' % (name, gid + '.geojson', lap))
                continue
            cc, shift, sgn, half, TOT, d = align(g, lp)
            e = (shift - sf + TOT / 2) % TOT - TOT / 2
            errs.append(abs(e))
            print('%-12s %8d %8.0f %+8.1f %8.3f' % (name, sf, shift, e, cc))
        if errs:
            print('\nхудшая ошибка %.1f м, средняя %.1f м — это и есть точность инструмента'
                  % (max(errs), sum(errs) / len(errs)))
        sys.exit(0)
    LAP = sys.argv[1] if len(sys.argv) > 1 else 'hungaroring_lap.json'
    GEO = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'hu-1986.geojson')
    cc, shift, sgn, half, TOT, d = align(GEO, LAP)
    print('%s %s, круг %.3f с' % (d['session']['circuit_short_name'], d['session']['year'],
                                  d['lap']['lap_duration']))
    print('согласие профилей %.3f, полуширина пика %.0f м, знак кривизны %+d' % (cc, half, sgn))
    print('ЛИНИЯ, ПО КОТОРОЙ РЕЖЕТСЯ КРУГ: S = %.1f м от начала контура  =>  sfShift = %d'
          % (shift, round(shift)))
