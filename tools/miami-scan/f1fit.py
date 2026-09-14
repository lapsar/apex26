#!/usr/bin/env python3
"""Привязка контура Майами к официальным данным F1 — как найдены sfShift и повороты.

Открытый circuit-API отдаёт круг телеметрии, координаты 19 поворотов и ДИСТАНЦИЮ
каждого от линии старта:

    curl 'https://api.multiviewer.app/api/v1/circuits/151/2022' -o mv_151.json

Координаты там в дециметрах и в своей системе (ключ `rotation` не помогает —
угол подбирается). Скрипт совмещает этот круг с контуром `bacinger/us-2022`
перебором угла и сдвига и печатает:

  * sfShift — линия старта как расстояние от начала контура,
  * S каждого поворота в наших метрах,
  * отступ каждого поворота от нашей осевой (сверка посадки).

ЛОВУШКА, которую стоит помнить: длина круга F1-телеметрии 5360 м против наших
5414, то есть накопленная разница около 1 %. Поэтому sfShift берётся НЕ из
подгонки по дальним поворотам (там набегает 60 м), а из ПЕРВОЙ ТОЧКИ круга
телеметрии — она и есть пересечение линии старта. Легла в 0.5 м от осевой.
"""
import json, math, sys
import numpy as np

CIRC = sys.argv[1] if len(sys.argv) > 1 else 'us-2022.geojson'
MV   = sys.argv[2] if len(sys.argv) > 2 else 'mv_151.json'

geo = json.load(open(CIRC))
gc = geo['features'][0]['geometry']['coordinates']
gc = gc[:-1] if gc[0] == gc[-1] else gc
lat0 = sum(p[1] for p in gc) / len(gc)
lon0 = sum(p[0] for p in gc) / len(gc)
R = np.array([[(p[0]-lon0)*111320*math.cos(math.radians(lat0)), (p[1]-lat0)*110540] for p in gc])
cum = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.vstack([R, R[:1]]), axis=0).T))])
TOT = cum[-1]

def proj(pt):
    """расстояние до осевой и координата S вдоль неё"""
    A, B = R, np.vstack([R[1:], R[:1]])
    V = B - A; L2 = (V**2).sum(1); L2[L2 == 0] = 1e-9
    t = np.clip(((pt - A) * V).sum(1) / L2, 0, 1)
    P = A + V * t[:, None]
    d = np.hypot(*(pt - P).T)
    i = int(np.argmin(d))
    return d[i], cum[i] + t[i] * np.hypot(*V[i])

d = json.load(open(MV))
F = np.array([d['x'], d['y']], float).T * 0.1
Fc = F - F.mean(0); Rc = R - R.mean(0)

def err(deg, off, step=4):
    th = math.radians(deg); c, s = math.cos(th), math.sin(th)
    Fr = Fc @ np.array([[c, -s], [s, c]]).T + off
    return float(np.mean([proj(p + R.mean(0))[0] for p in Fr[::step]]))

best = min(((err(g, np.zeros(2), 8), g) for g in np.arange(0, 360, 0.25)))
bd, bo, be = best[1], np.zeros(2), best[0]
for it in range(4):                                   # уточнение угла и сдвига
    ds, os_ = 0.25 / 2**it, 4.0 / 2**it
    moved = True
    while moved:
        moved = False
        for dd in (-ds, 0, ds):
            for dx in (-os_, 0, os_):
                for dy in (-os_, 0, os_):
                    if dd == dx == dy == 0: continue
                    e = err(bd + dd, bo + np.array([dx, dy]))
                    if e < be - 1e-4:
                        be, bd, bo = e, bd + dd, bo + np.array([dx, dy]); moved = True
print('совмещение: угол %.3f°, сдвиг (%.1f, %.1f), средняя ошибка %.2f м' % (bd, bo[0], bo[1], be))

th = math.radians(bd); c, s = math.cos(th), math.sin(th)
to_world = lambda P: (P - F.mean(0)) @ np.array([[c, -s], [s, c]]).T + bo + R.mean(0)

dd, SF = proj(to_world(F[:1])[0])
print('ЛИНИЯ СТАРТА: первая точка круга телеметрии на S=%.1f м, отступ от осевой %.1f м' % (SF, dd))
print('  => sfShift = %d' % round(SF))
print('\n T   S от старта (F1)   S у нас   отступ')
for cn in d['corners']:
    p = to_world(np.array([[cn['trackPosition']['x'], cn['trackPosition']['y']]]) * 0.1)[0]
    dd, S = proj(p)
    print('%3s %12.1f %11.1f %8.1f м' % (cn['number'], cn['length']/10.0, (S - SF) % TOT, dd))
