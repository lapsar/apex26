#!/usr/bin/env python3
"""Сверка посадки и ориентации контура Хунгароринга (CLAUDE.md §7, ловушка №1 — зеркало).

Печатает: направление обхода (площадь и сумма поворотов), длиннейшую прямую,
наименьший радиус, долю круга с малым радиусом и стороны всех поворотов.
Мерки те же, что применялись к Майами и Монреалю, — так числа сравнимы.
"""
import json, math, sys, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

GEO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'hu-1986.geojson')
MV  = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'mv_4.json')

pts = np.array(to_metres(coords(GEO)))
n = len(pts)
seg = np.hypot(*np.diff(np.vstack([pts, pts[:1]]), axis=0).T)
cum = np.concatenate([[0], np.cumsum(seg)])
TOT = cum[-1]

# площадь (знак = направление обхода) и суммарный поворот
area = 0.5 * sum(pts[i][0]*pts[(i+1) % n][1] - pts[(i+1) % n][0]*pts[i][1] for i in range(n))
ang = 0.0
kinks = []
for i in range(n):
    a = pts[i] - pts[i-1]
    b = pts[(i+1) % n] - pts[i]
    t = math.atan2(a[0]*b[1]-a[1]*b[0], a[0]*b[0]+a[1]*b[1])
    ang += t
    kinks.append(abs(math.degrees(t)))
print('точек %d, контур %.1f м' % (n, TOT))
print('площадь %+.0f м², сумма поворотов %+.1f°  =>  обход %s' %
      (area, math.degrees(ang), 'ПРОТИВ часовой' if area > 0 else 'ПО часовой'))
print('медиана отрезка %.1f м, худший излом между соседями %.1f°' %
      (float(np.median(seg)), max(kinks)))

# длиннейшая прямая: подряд идущие отрезки, где излом меньше 3°
best = cur = 0.0
for i in range(2*n):
    j = i % n
    if kinks[j] < 3.0:
        cur += seg[j]
        best = max(best, cur)
    else:
        cur = 0.0
print('длиннейшая прямая %.0f м' % min(best, TOT))

# радиус окружностью через точки в ~20 м (как в map-plan Майами)
def radius_at(i, base=20.0):
    def walk(d):
        s, k = 0.0, i
        while s < base:
            k2 = (k + d) % n
            s += np.hypot(*(pts[k2] - pts[k]))
            k = k2
        return pts[k]
    a, b, c = walk(-1), pts[i], walk(1)
    ab, bc = b - a, c - b
    cr = ab[0]*bc[1] - ab[1]*bc[0]
    if abs(cr) < 1e-9:
        return 1e9
    A, B, C = np.hypot(*ab), np.hypot(*bc), np.hypot(*(c - a))
    return A*B*C / (2*abs(cr))

rad = np.array([radius_at(i) for i in range(n)])
print('наименьший радиус осевой %.0f м (S=%.0f), доля круга R<80 м %.1f %%' %
      (rad.min(), cum[int(rad.argmin())], 100.0*seg[rad < 80].sum()/TOT))

if os.path.exists(MV):
    d = json.load(open(MV))
    print('\nповороты из официальных данных F1 (%d записей):' % len(d['corners']))
    for cn in d['corners']:
        print('  T%-3s%s  угол %6.1f°  дистанция %.0f м' %
              (cn['number'], cn.get('letter') or ' ', cn.get('angle', 0), cn['length']/10.0))
