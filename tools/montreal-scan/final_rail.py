#!/usr/bin/env python3
"""Итоговая линия барьера Монреаля -> кусок разметки rail:{L,R} в [lat,lon].

Правило (сложилось из замера и осмотра каждого поворота):
  • берём замер по снимку: бетонный гребень, где он уверенно виден, иначе кромку покрытия;
  • пол 9.0 м от осевой — решение владельца «не ближе 2 м за кромкой»;
  • потолок 12 м везде, КРОМЕ внешней стороны шпильки (S 2540..2850): там на снимке
    настоящий широкий асфальтовый вылет, ему разрешено до 20 м;
  • медиана + сглаживание, чтобы лента не ломалась.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROAD_HALF = 7.0
FLOOR = ROAD_HALF + 2.0
CAP = 12.0
WIDE = []                                # потолок нигде не поднимаем
# Явные расширения: там, где на снимке настоящий широкий вылет и автомат его
# не берёт (яркая линия внутри вылета перебивает дальнюю). Значения сняты по
# снимку с наложенными кольцами отступа, точность ~2 м.
OVERRIDE = [('L', 2620.0, 2800.0, 16.0, 45.0)]   # внешняя сторона шпильки L'Epingle


def smooth(a, win, passes=2):
    n = len(a)
    for _ in range(passes):
        b = []
        for i in range(n):
            s = w = 0.0
            for d in range(-win, win + 1):
                k = (i + d) % n
                ww = 1.0 - abs(d) / (win + 1.0)
                s += a[k] * ww
                w += ww
            b.append(s / w)
        a = b
    return a


def cap_at(s):
    for a, b, c in WIDE:
        if a <= s <= b:
            return c
    return CAP


def main():
    tr = json.load(open(os.path.join(HERE, 'traced.json')))
    t2 = json.load(open(os.path.join(HERE, 'traced2.json')))
    cl = json.load(open(os.path.join(HERE, 'centerline.json')))
    S, P, R = cl['S'], cl['P'], cl['R']
    n = len(S)
    O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
    g2d = lambda x, z: (O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon'])

    prof = {}
    for side in 'LR':
        raw = []
        for i in range(n):
            ridge, conf, edge = t2[side]['wall'][i], t2[side]['conf'][i], tr[side]['edge'][i]
            v = ridge if (conf > 0.35 and ridge < 19.0) else (edge + 0.8 if edge < 19.0 else CAP)
            raw.append(v)
        med = [sorted(raw[(i + d) % n] for d in range(-4, 5))[4] for i in range(n)]
        sm = smooth(med, 5, 2)
        base = [max(FLOOR, min(cap_at(S[i]), sm[i])) for i in range(n)]
        for (sd, a, b, val, taper) in OVERRIDE:
            if sd != side:
                continue
            for i in range(n):
                s_ = S[i]
                if a - taper <= s_ <= b + taper:
                    k = 1.0 if a <= s_ <= b else (
                        (s_ - (a - taper)) / taper if s_ < a else ((b + taper) - s_) / taper)
                    base[i] = max(base[i], FLOOR + (val - FLOOR) * k)
        prof[side] = smooth(base, 4, 1)

    # отчёт
    for side in 'LR':
        a = sorted(prof[side])
        q = lambda f: a[int(f * (len(a) - 1))]
        onfloor = 100 * sum(1 for v in prof[side] if v <= FLOOR + 0.01) / n
        print(f"{side}: отступ мед {q(.5):.1f} м, 90% {q(.9):.1f}, макс {q(1):.1f}; "
              f"на минимуме {onfloor:.0f} % круга")
        pts = [(P[i][0] + R[i][0] * (-1 if side == 'L' else 1) * prof[side][i],
                P[i][1] + R[i][1] * (-1 if side == 'L' else 1) * prof[side][i]) for i in range(n)]
        worst = 0
        for i in range(n):
            a1, b1, c1 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
            v1 = (b1[0] - a1[0], b1[1] - a1[1])
            v2 = (c1[0] - b1[0], c1[1] - b1[1])
            l1, l2 = math.hypot(*v1), math.hypot(*v2)
            if l1 < 1e-6 or l2 < 1e-6:
                continue
            worst = max(worst, math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))))))
        print(f"   худший излом {worst:.0f}°")

    # выгрузка: шаг ~6 м, замкнутая ломаная
    step = max(1, int(round(6.0 / (S[1] - S[0]))))
    lines = []
    for side in 'LR':
        sgn = -1 if side == 'L' else 1
        pts = []
        for i in range(0, n, step):
            x = P[i][0] + R[i][0] * sgn * prof[side][i]
            z = P[i][1] + R[i][1] * sgn * prof[side][i]
            lat, lon = g2d(x, z)
            pts.append(f"[{lat:.6f},{lon:.6f}]")
        rows = [','.join(pts[k:k + 8]) for k in range(0, len(pts), 8)]
        lines.append(f"    {side}: [\n      " + ',\n      '.join(rows) + "\n    ],")
        print(f"{side}: {len(pts)} точек, шаг {step * (S[1]-S[0]):.1f} м")
    open(os.path.join(HERE, 'rail_snippet.js'), 'w').write(
        "  rail: { height:1.15,\n" + "\n".join(lines) + "\n  },\n")
    json.dump(prof, open(os.path.join(HERE, 'rail_final.json'), 'w'))
    print("выгружено: rail_snippet.js")


if __name__ == '__main__':
    main()
