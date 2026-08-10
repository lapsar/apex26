#!/usr/bin/env python3
"""Барьер как СВЕТЛЫЙ ГРЕБЕНЬ: узкая яркая полоса, темнее по обе стороны.

Отличает бетонный блок от большой светлой площадки (паддок, дорожки),
на которых спотыкался поиск «по кромке покрытия».
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
from trace import load, fields, dp_track      # noqa: E402


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'esri'
    zoom = int(sys.argv[2]) if len(sys.argv) > 2 else 19
    lo_m = float(sys.argv[3]) if len(sys.argv) > 3 else 7.5    # ближе барьера не бывает
    hi_m = float(sys.argv[4]) if len(sys.argv) > 4 else 20.0

    im, meta = load(src, zoom)
    step, half_w = meta['step'], meta['half_w']
    W, H = im.size
    L, PAV = fields(im)
    col = lambda off: int(round((off + half_w) / step))
    off_of = lambda c: c * step - half_w
    w1 = max(1, int(round(1.4 / step)))        # плечо гребня ~1.4 м

    out = {'S': meta['S']}
    for side, sgn in (('L', -1), ('R', 1)):
        lo, hi = (col(-hi_m), col(-lo_m)) if sgn < 0 else (col(lo_m), col(hi_m))
        cost, ridge_v = [], []
        for i in range(H):
            Li, Pi = L[i], PAV[i]
            row = [2.0] * W
            rv = [0.0] * W
            for c in range(lo, hi):
                a, b = Li[max(0, c - w1)], Li[min(W - 1, c + w1)]
                r = Li[c] - 0.5 * (a + b)                     # гребень
                r *= Pi[c]                                    # только не-трава
                rv[c] = r
                row[c] = -min(1.0, max(0.0, r / 22.0)) + 0.022 * abs(off_of(c))
            cost.append(row)
            ridge_v.append(rv)
        path = dp_track(cost, jump=0.30, lo=lo, hi=hi)
        out[side] = dict(wall=[round(abs(off_of(c)), 2) for c in path],
                         conf=[round(min(1.0, max(0.0, ridge_v[i][path[i]] / 22.0)), 2) for i in range(H)])
    json.dump(out, open(os.path.join(HERE, 'traced2.json'), 'w'))

    for side in 'LR':
        a = sorted(out[side]['wall'])
        c = out[side]['conf']
        q = lambda f: a[int(f * (len(a) - 1))]
        strong = 100 * sum(1 for v in c if v > 0.35) / len(c)
        print(f"{side}: отступ мед {q(.5):.1f} м (10% {q(.1):.1f}, 90% {q(.9):.1f}); "
              f"уверенных станций {strong:.0f} %")


if __name__ == '__main__':
    main()
