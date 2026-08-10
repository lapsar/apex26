#!/usr/bin/env python3
"""Проследить по ленте непрерывные линии: кромка покрытия и линия барьера.

Вместо независимого решения по каждой строке — динамическое программирование
по всей ленте со штрафом за боковой скачок. Линия получается непрерывной,
одиночный мусорный пиксель её не уводит.
"""
import json, math, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load(src='esri', zoom=19):
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    return im, meta


def fields(im):
    """Для каждого пикселя: яркость, насыщенность, «покрытие» (асфальт/бетон)."""
    W, H = im.size
    px = im.load()
    L = [[0.0] * W for _ in range(H)]
    PAV = [[0.0] * W for _ in range(H)]
    for i in range(H):
        Li, Pi = L[i], PAV[i]
        for k in range(W):
            r, g, b = px[k, i]
            v = 0.299 * r + 0.587 * g + 0.114 * b
            mx, mn = max(r, g, b), min(r, g, b)
            s = 0.0 if mx == 0 else (mx - mn) / mx
            Li[k] = v
            green = g > r + 10 and g > b + 10
            water = v < 45
            kerb = r > g + 18 and r > 110 and v > 90        # красно-белый поребрик — это трасса, а не «не покрытие»
            Pi[k] = 1.0 if kerb else (0.0 if (green or water) else max(0.0, min(1.0, (1.0 - s * 2.2))))
    return L, PAV


def dp_track(cost, jump=1.6, lo=None, hi=None):
    """cost[i][c] — цена; вернуть путь с минимальной суммой и штрафом за скачок."""
    H, W = len(cost), len(cost[0])
    lo = 0 if lo is None else lo
    hi = W if hi is None else hi
    INF = 1e18
    prev = [cost[0][c] if lo <= c < hi else INF for c in range(W)]
    back = []
    for i in range(1, H):
        cur = [INF] * W
        bk = [0] * W
        for c in range(lo, hi):
            best, bi = INF, c
            for d in range(-3, 4):
                p = c + d
                if lo <= p < hi:
                    v = prev[p] + jump * abs(d)
                    if v < best:
                        best, bi = v, p
            cur[c] = best + cost[i][c]
            bk[c] = bi
        prev, _ = cur, None
        back.append(bk)
    c = min(range(lo, hi), key=lambda k: prev[k])
    path = [c]
    for i in range(H - 2, -1, -1):
        c = back[i][c]
        path.append(c)
    path.reverse()
    return path


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'esri'
    zoom = int(sys.argv[2]) if len(sys.argv) > 2 else 19
    im, meta = load(src, zoom)
    step, half_w = meta['step'], meta['half_w']
    W, H = im.size
    L, PAV = fields(im)
    col = lambda off: int(round((off + half_w) / step))
    off_of = lambda c: c * step - half_w
    win = max(2, int(round(2.0 / step)))            # окно 2 м

    out = {'S': meta['S']}
    for side, sgn in (('L', -1), ('R', 1)):
        lo, hi = (col(-26.0), col(-4.0)) if sgn < 0 else (col(4.0), col(26.0))
        # 1) КРОМКА: покрытие внутри, не-покрытие снаружи
        cost_e = []
        for i in range(H):
            Pi = PAV[i]
            row = [0.0] * W
            for c in range(lo, hi):
                a = sum(Pi[max(0, c - sgn * win):c] if sgn > 0 else Pi[c + 1:c + 1 + win]) / win
                b = sum(Pi[c + 1:c + 1 + win] if sgn > 0 else Pi[max(0, c - win):c]) / win
                row[c] = -(a - b)
            cost_e.append(row)
        edge = dp_track(cost_e, jump=0.35, lo=lo, hi=hi)

        # 2) БАРЬЕР: яркая малонасыщенная полоса не ближе кромки
        cost_w = []
        for i in range(H):
            Li, Pi = L[i], PAV[i]
            e = edge[i]
            base = sorted(Li[col(sgn * 1.0):col(sgn * 4.0)] if sgn > 0 else Li[col(sgn * 4.0):col(sgn * 1.0)])
            ref = base[len(base) // 2] if base else 90.0
            row = [0.0] * W
            for c in range(lo, hi):
                d = abs(c - e) * step
                if (sgn > 0 and c < e - 1) or (sgn < 0 and c > e + 1) or d > 16.0:
                    row[c] = 3.0
                else:
                    bright = max(0.0, (Li[c] - ref - 18.0) / 60.0)
                    row[c] = -min(1.0, bright) * Pi[c] + 0.02 * d
            cost_w.append(row)
        wall = dp_track(cost_w, jump=0.5, lo=lo, hi=hi)

        out[side] = dict(edge=[round(abs(off_of(c)), 2) for c in edge],
                         wall=[round(abs(off_of(c)), 2) for c in wall])
    json.dump(out, open(os.path.join(HERE, 'traced.json'), 'w'))

    for side in 'LR':
        for what in ('edge', 'wall'):
            a = sorted(out[side][what])
            q = lambda f: a[int(f * (len(a) - 1))]
            print(f"{side} {what}: мед {q(.5):.1f} м (10% {q(.1):.1f}, 90% {q(.9):.1f})")

    # сверка с OSM
    near = json.load(open(os.path.join(HERE, 'near.json')))
    S = meta['S']
    diffs = {'edge': [], 'wall': []}
    for w in near:
        if w['tags'].get('barrier') not in ('jersey_barrier', 'wall', 'guard_rail'):
            continue
        for (s, off) in w['pts']:
            if abs(off) > 30:
                continue
            i = min(range(len(S)), key=lambda k: abs(S[k] - s))
            side = 'L' if off < 0 else 'R'
            for what in diffs:
                diffs[what].append(abs(out[side][what][i] - abs(off)))
    for what in diffs:
        d = sorted(diffs[what])
        if not d:
            continue
        q = lambda f: d[int(f * (len(d) - 1))]
        print(f"сверка с OSM ({what}): {len(d)} точек, мед {q(.5):.2f} м, 75% {q(.75):.2f}, "
              f"90% {q(.9):.2f}; в пределах 1.5 м: {100*sum(1 for x in d if x<=1.5)/len(d):.0f} %")


if __name__ == '__main__':
    main()
