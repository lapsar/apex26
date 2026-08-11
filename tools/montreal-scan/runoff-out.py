#!/usr/bin/env python3
"""surface.json -> готовые строки runoff для SCENERY_MONTREAL.

Правила (решены осознанно, а не подобраны):
  • кладётся ТОЛЬКО асфальт. Трава — это голая земля: у мира и так травяное
    основание с той же текстурой, лишняя лента дала бы те же пиксели за меш
    и вызов отрисовки. Гравий не кладётся вовсе: у настоящего Монреаля
    песочниц нет, редкие «песочные» пиксели на снимке — дорожки парка.
  • ширина везде 14 м: строитель всё равно обрезает ленту по отбойнику
    (wall-0.3), а отбойник снят по снимку. То есть асфальт заполняет ровно
    то место, которое огораживает барьер, — и в шпильке это настоящие 8.7 м,
    и на прямых наши выдуманные 1.7 м.
  • сглаживание медианой по 60 м и выброс отрезков короче 60 м: без этого
    лента выходит пятнистой, а на скорости пятна читаются как грязь.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
MINLEN = 60.0
WIN = 15          # станций (по 4 м) в окне медианы


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def main():
    d = json.load(open(os.path.join(HERE, 'surface.json')))
    cl = json.load(open(os.path.join(HERE, 'centerline.json')))
    S, P, R = d['S'], cl['P'], cl['R']
    M = len(S)
    rows = []
    for side, sgn in (('L', -1), ('R', 1)):
        rec = d[side]
        lab = ['grass' if r['grass'] > 0.5 else 'asphalt' for r in rec]   # гравий -> к соседям
        sm = []
        for i in range(M):
            w = [lab[(i + k) % M] for k in range(-(WIN // 2), WIN // 2 + 1)]
            sm.append(max(set(w), key=w.count))
        segs, st = [], 0
        for i in range(1, M + 1):
            if i == M or sm[i] != sm[st]:
                segs.append([st, i - 1, sm[st]])
                st = i
        # короткие куски растворяются в соседе
        changed = True
        while changed:
            changed = False
            for j, sg in enumerate(segs):
                if len(segs) < 2:
                    break
                if S[sg[1]] - S[sg[0]] < MINLEN:
                    segs[j][2] = segs[(j - 1) % len(segs)][2]
                    changed = True
            merged = [segs[0]]
            for sg in segs[1:]:
                if sg[2] == merged[-1][2]:
                    merged[-1][1] = sg[1]
                else:
                    merged.append(sg)
            if len(merged) != len(segs):
                segs, changed = merged, True
        for a, b, t in segs:
            if t != 'asphalt' or S[b] - S[a] < MINLEN:
                continue
            mid = (a + b) // 2
            off = 11.0
            pa, pb = P[a], P[b]
            pm = (P[mid][0] + R[mid][0] * sgn * off, P[mid][1] + R[mid][1] * sgn * off)
            fl = game2deg(*pa)
            tl = game2deg(*pb)
            rl = game2deg(*pm)
            gaps = [rec[i]['gap'] for i in range(a, b + 1)]
            rows.append((S[a], S[b], side, fl, tl, rl, max(gaps)))
    rows.sort()
    for (a, b, side, fl, tl, rl, gap) in rows:
        note = ' широкий вылет' if gap > 3.5 else ''
        print("    {fromS:%.0f,toS:%.0f,side:'%s',type:'asphalt',width:14, "
              "fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f], refLatLon:[%.6f,%.6f]}, "
              "// %.0f-%.0f м, до стены %.1f м%s"
              % (a, b, side, fl[0], fl[1], tl[0], tl[1], rl[0], rl[1], a, b, gap, note))
    print(f"// всего зон: {len(rows)}; общая длина "
          f"{sum(b - a for (a, b, *_ ) in rows):.0f} м из {S[-1]:.0f} м круга")


if __name__ == '__main__':
    main()
