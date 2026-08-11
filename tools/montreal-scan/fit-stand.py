#!/usr/bin/env python3
"""Подобрать границы трибуны по развёртке: доля «постройки» на каждом отступе.

Для участка круга и стороны считает, на какой доле станций данный отступ занят
постройкой (яркий, малонасыщенный, не зелёный пиксель). Сплошная полоса высокой
доли — это и есть трибуна: её ближний и дальний край печатаются числами,
а не берутся на глаз. Обе стороны считаются сразу, чтобы не перепутать.

  python3 fit-stand.py <S0> <S1> [src] [zoom] [порог_доли]
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load(src, zoom):
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = np.asarray(Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')).astype(float)
    return meta, im


def mask(im):
    mx = im.max(axis=2); mn = im.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    green = (im[:, :, 1] > im[:, :, 0] + 8) & (im[:, :, 1] > im[:, :, 2] + 8)
    return (mx > 145) & (sat < 0.22) & (~green)


def main():
    s0, s1 = float(sys.argv[1]), float(sys.argv[2])
    src = sys.argv[3] if len(sys.argv) > 3 else 'esri'
    zoom = sys.argv[4] if len(sys.argv) > 4 else '19'
    thr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6

    meta, im = load(src, zoom)
    S = np.array(meta['S']); half_w, step = meta['half_w'], meta['step']
    offs = np.array([-half_w + i * step for i in range(im.shape[1])])
    b = mask(im)
    rows = np.where((S >= s0) & (S <= s1)) if s0 <= s1 else np.where((S >= s0) | (S <= s1))
    frac = b[rows].mean(axis=0)

    print(f"{src} z{zoom}, S {s0:.0f}..{s1:.0f} ({len(rows[0])} станций), порог доли {thr}")
    for side, nm in ((1, 'R (право по ходу)'), (-1, 'L (лево по ходу)')):
        sel = np.where(offs * side >= 9)[0]
        sel = sel[np.argsort(np.abs(offs[sel]))]
        o = np.abs(offs[sel]); f = frac[sel]
        runs, cur = [], None
        for k in range(len(o)):
            if f[k] >= thr:
                cur = [o[k], o[k]] if cur is None else [cur[0], o[k]]
            elif cur:
                runs.append(cur); cur = None
        if cur:
            runs.append(cur)
        runs = [r for r in runs if r[1] - r[0] >= 5]
        s = ", ".join(f"{a:.1f}..{b_:.1f} м (глубина {b_-a:.1f})" for a, b_ in runs) or "нет сплошной полосы"
        print(f"  {nm}: {s}")
        prof = "  ".join(f"{int(x)}:{frac[np.argmin(np.abs(offs - side*x))]:.2f}" for x in range(10, 61, 5))
        print(f"     доля по отступам  {prof}")


if __name__ == '__main__':
    main()
