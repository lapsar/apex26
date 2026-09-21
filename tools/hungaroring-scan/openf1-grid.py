#!/usr/bin/env python3
"""Стартовая РЕШЁТКА из живой телеметрии — самая точная проверка линии старта.

За секунду до погасания огней все болиды СТОЯТ в своих клетках. Их координаты —
прямой замер того, где в жизни нарисована решётка: не снимок, не схема,
не арифметика дистанции гонки, а третий независимый источник.

    python3 openf1-grid.py 11342 2026-07-26T13:03:18      # ключ сессии и миг старта
    python3 openf1-grid.py --file=grid_raw.json           # из готовой выгрузки

Миг старта берётся из race_control: сообщение «SESSION STARTED» в гоночной сессии.
Совмещение систем координат берётся готовым из openf1_fit.json — его считает
openf1-road.py по куску гонки; НА РЕШЁТКЕ ПОДБИРАТЬ НЕЛЬЗЯ, точки стоят на месте.

ПОПЕРЁК ДОРОГИ ЭТИ ТОЧКИ НИЧЕГО НЕ ГОВОРЯТ (замер 09.2026): 22 болида ложатся
на ПРЯМУЮ с разбросом 0.69 м, без зигзага ±2 м, который у настоящих клеток есть,
а координаты стоящего болида не меняются от кадра к кадру ни на сантиметр.
Годится только продольная координата — она-то и нужна.
"""
import json, math, os, sys, time, collections, datetime
import urllib.parse, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

API = 'https://api.openf1.org/v1/'
GEO = os.path.join(HERE, 'hu-1986.geojson')
SFSHIFT = float(os.environ.get('HUNGARO_SF', 4119))

R = np.array(to_metres(coords(GEO)))
A = R; B = np.vstack([R[1:], R[:1]]); V = B - A
L = np.hypot(V[:, 0], V[:, 1]); L2 = np.maximum(L ** 2, 1e-9)
CUM = np.concatenate([[0], np.cumsum(L)])


def get(path, **q):
    url = API + path + '?' + urllib.parse.urlencode(q, safe='<>=')
    req = urllib.request.Request(url, headers={'User-Agent': 'apex26-dev'})
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except Exception:
            if a == 3:
                raise
            time.sleep(2 * (a + 1))


def project(P):
    t = np.clip(((P[:, None, :] - A[None]) * V[None]).sum(2) / L2[None], 0, 1)
    Q = A[None] + V[None] * t[..., None]
    W = P[:, None, :] - Q
    d = np.hypot(W[..., 0], W[..., 1])
    i = d.argmin(1); r = np.arange(len(P))
    n = V[i] / L[i][:, None]
    return CUM[i] + t[r, i] * L[i], n[:, 0] * W[r, i, 1] - n[:, 1] * W[r, i, 0]


def load():
    f = next((a.split('=')[1] for a in sys.argv if a.startswith('--file=')), None)
    if f:
        return json.load(open(f))
    sk = int(sys.argv[1]); t0 = datetime.datetime.fromisoformat(sys.argv[2])
    pts = get('location', session_key=sk,
              **{'date>': (t0 - datetime.timedelta(seconds=35)).isoformat(),
                 'date<': t0.isoformat()})
    json.dump(pts, open(os.path.join(HERE, 'grid_raw.json'), 'w'))
    return pts


def main():
    j = json.load(open(os.path.join(HERE, 'openf1_fit.json')))
    th = math.radians(j['deg']); c, s = math.cos(th), math.sin(th)
    by = collections.defaultdict(list)
    for p in load():
        if p['x'] or p['y']:
            by[p['driver_number']].append(p)
    pts, names = [], []
    for dn, ps in by.items():
        ps.sort(key=lambda p: p['date'])
        tail = np.array([[q['x'], q['y']] for q in ps[-12:]], float) * 0.1
        if np.hypot(*(tail.max(0) - tail.min(0))) > 2.0:     # ехал, а не стоял
            continue
        pts.append(tail.mean(0)); names.append(dn)
    P = (np.array(pts) - np.array(j['mean'])) @ np.array([[c, -s], [s, c]]).T \
        + np.array(j['off']) + R.mean(0)
    S, O = project(P)
    order = np.argsort(-S)
    print('стоящих болидов: %d' % len(S))
    print(' место  №     S, м   от осевой   шаг')
    prev, gaps = None, []
    for k, i in enumerate(order):
        g = '' if prev is None else '%5.2f' % (prev - S[i])
        if prev is not None and prev - S[i] < 30:
            gaps.append(prev - S[i])
        print('  %4d  %3d  %7.1f   %+6.2f    %s' % (k + 1, names[i], S[i], O[i], g))
        prev = S[i]
    print('шаг между клетками: медиана %.2f м (в жизни 8 м)' % np.median(gaps))
    print('ПЕРВАЯ КЛЕТКА на S = %.1f м; наш sfShift = %.0f; расхождение %.1f м'
          % (S[order[0]], SFSHIFT, abs(S[order[0]] - SFSHIFT)))


if __name__ == '__main__':
    main()
