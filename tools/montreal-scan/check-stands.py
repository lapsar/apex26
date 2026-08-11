#!/usr/bin/env python3
"""Проверить набор трибун ДО того, как он попадёт в разметку.

Три беды, каждая из которых уже случалась на Монреале:
  • лента на отступе складывается сама на себя внутри тесного поворота;
  • трибуна дотягивается до соседнего витка трассы (петля шпильки узкая);
  • две трибуны сходятся и на экране выглядят одной кучей.

Читает stands.json (там off — СЕРЕДИНА, как рисует map-stands.py) и печатает
по каждой трибуне излом дальней кромки, зазор до любого витка трассы и
ближайшую соседнюю трибуну. Заодно печатает строку разметки для index.html,
где off — уже БЛИЖНИЙ край.
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); M = len(P)
stands = json.load(open(os.path.join(HERE, 'stands.json')))


def ll(s, side=None, off=0.0):
    i = int(np.argmin(np.abs(S - s)))
    sgn = 0 if side is None else (1 if side == 'R' else -1)
    x = P[i][0] + R[i][0] * sgn * off
    z = P[i][1] + R[i][1] * sgn * off
    return (O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon'])


def idx_range(a, b):
    r = [i for i in range(M) if (a <= S[i] <= b if a <= b else (S[i] >= a or S[i] <= b))]
    r.sort(key=lambda i: (S[i] - a) % S[-1])
    return r


def foot(st, step=2.0):
    sgn = 1 if st['side'] == 'R' else -1
    near, far = st['off'] - st['d'] / 2, st['off'] + st['d'] / 2
    pts = []
    for i in idx_range(st['fromS'], st['toS']):
        for o in np.arange(near, far + 0.01, step):
            pts.append([P[i][0] + R[i][0] * sgn * o, P[i][1] + R[i][1] * sgn * o])
    return np.array(pts), near, far


def main():
    feet = []
    print(f"{'трибуна':28s} {'излом':>7s} {'до полотна':>11s} {'до соседа':>10s}")
    for st in stands:
        pts, near, far = foot(st)
        sgn = 1 if st['side'] == 'R' else -1
        idx = idx_range(st['fromS'], st['toS'])
        edge = np.array([[P[i][0] + R[i][0] * sgn * far, P[i][1] + R[i][1] * sgn * far] for i in idx])
        worst = 0.0
        for k in range(1, len(edge) - 1):
            v1, v2 = edge[k] - edge[k - 1], edge[k + 1] - edge[k]
            l1, l2 = np.hypot(*v1), np.hypot(*v2)
            if l1 < 1e-6 or l2 < 1e-6:
                worst = 180.0; break
            worst = max(worst, math.degrees(math.acos(np.clip(np.dot(v1, v2) / (l1 * l2), -1, 1))))
        gap = min(np.hypot(P[:, 0] - p[0], P[:, 1] - p[1]).min() for p in pts)
        feet.append((st['name'], pts, worst, gap))
    for i, (nm, pts, worst, gap) in enumerate(feet):
        best = min(((np.hypot(pts[:, None, 0] - o[None, :, 0], pts[:, None, 1] - o[None, :, 1]).min(), n)
                    for j, (n, o, _, _) in enumerate(feet) if j != i), default=(9e9, '—'))
        flag = '  <-- ПРОВЕРЬ' if (worst > 40 or gap < 9 or best[0] < 2) else ''
        print(f"{nm:28s} {worst:6.1f}° {gap:10.1f} м {best[0]:9.1f} м ({best[1]}){flag}")
    print("\nстроки для разметки (off = ближний край):")
    for st in stands:
        _, near, far = foot(st)
        la, lo = ll(st['fromS']); lb, lob = ll(st['toS'])
        print(f"    {{kind:'grandstand', shape:'arc', name:'{st['name']}', fromS:{st['fromS']}, "
              f"toS:{st['toS']}, side:'{st['side']}', off:{near:g}, h:{st.get('h', 12)}, d:{st['d']}, "
              f"fromLatLon:[{la:.6f},{lo:.6f}], toLatLon:[{lb:.6f},{lob:.6f}]}},")


if __name__ == '__main__':
    main()
