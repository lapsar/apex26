#!/usr/bin/env python3
"""Где по развёртке лежат ЯРКИЕ КРЫШИ: по станциям, а не в среднем.

fit-stand.py усредняет долю по участку и на гоночном снимке путает крышу
с бетоном и песком. Здесь печатается КАЖДАЯ станция: сплошные отрезки
«яркая крыша» с их отступами. Постройка видна как ровный столбец отрезков.

  python3 roofs.py <S0> <S1> <side R|L> [src] [zoom] [порог яркости]
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    s0, s1 = float(sys.argv[1]), float(sys.argv[2])
    side = 1 if sys.argv[3].upper() == 'R' else -1
    src = sys.argv[4] if len(sys.argv) > 4 else 'esri'
    zoom = sys.argv[5] if len(sys.argv) > 5 else '19'
    thr = float(sys.argv[6]) if len(sys.argv) > 6 else 165.0

    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = np.asarray(Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')).astype(float)
    S = np.array(meta['S']); half_w, step = meta['half_w'], meta['step']
    offs = np.array([-half_w + i * step for i in range(im.shape[1])])
    mx = im.max(axis=2); mn = im.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    green = (im[:, :, 1] > im[:, :, 0] + 8) & (im[:, :, 1] > im[:, :, 2] + 8)
    b = (mx > thr) & (sat < 0.18) & (~green)

    rows = np.where((S >= s0) & (S <= s1))[0]
    sel = np.where((offs * side >= 8) & (offs * side <= half_w))[0]
    sel = sel[np.argsort(np.abs(offs[sel]))]
    o = np.abs(offs[sel])
    print(f"{src} z{zoom}, сторона {'R' if side > 0 else 'L'}, порог яркости {thr:.0f}")
    for r in rows:
        f = b[r][sel]
        runs, st = [], None
        for k in range(len(o)):
            if f[k] and st is None:
                st = o[k]
            elif not f[k] and st is not None:
                if o[k - 1] - st >= 3.0:
                    runs.append((st, o[k - 1]))
                st = None
        if st is not None and o[-1] - st >= 3.0:
            runs.append((st, o[-1]))
        txt = '  '.join(f"{a:.0f}-{b_:.0f}" for a, b_ in runs) or '-'
        print(f"  S {S[r]:7.1f}  {txt}")


if __name__ == '__main__':
    main()
