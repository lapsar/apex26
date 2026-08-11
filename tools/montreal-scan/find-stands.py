#!/usr/bin/env python3
"""Найти по развёртке места, где вдоль трассы стоит трибуна.

ДВА признака, и второй важнее первого:
  • «крыша» — яркий малонасыщенный пиксель (навес, тент, бетон). Им нашлись
    трибуны главной прямой и восточной стороны шпильки;
  • «зрители» — ТЁМНЫЙ пиксель, не зелёный и не синий. Открытая трибуна,
    набитая людьми, на снимке тёмная и пёстрая, и по «яркой крыше» она
    не находится вообще. Именно так была пропущена трибуна внутри петли
    шпильки (v1.15.29), а по яркости вместо неё нашёлся бетон паддока.

Оба признака одинаково срабатывают и на посторонних вещах (бетонная площадка,
мокрый асфальт, тень от дерева), поэтому вывод — это КАНДИДАТЫ. Решение
принимается по картинке (sheet.py, sides.py) и по официальной схеме трибун.

  python3 find-stands.py [src] [zoom] [мин_длина_м] [мин_глубина_м] [макс_отступ]
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def masks(im):
    mx = im.max(axis=2); mn = im.min(axis=2)
    g = im.mean(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    green = (im[:, :, 1] > im[:, :, 0] + 8) & (im[:, :, 1] > im[:, :, 2] + 8)
    blue = (im[:, :, 2] > im[:, :, 0] + 12) & (g < 130)          # вода и тень на воде
    roof = (mx > 145) & (sat < 0.22) & (~green)
    crowd = (g < 100) & (~green) & (~blue)
    return roof, crowd


def runs(o, f, thr, min_depth):
    out, cur = [], None
    for k in range(len(o)):
        if f[k] >= thr:
            cur = [o[k], o[k]] if cur is None else [cur[0], o[k]]
        elif cur:
            out.append(cur); cur = None
    if cur:
        out.append(cur)
    return [r for r in out if r[1] - r[0] >= min_depth]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'esri'
    zoom = sys.argv[2] if len(sys.argv) > 2 else '19'
    min_len = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
    min_depth = float(sys.argv[4]) if len(sys.argv) > 4 else 6.0
    max_off = float(sys.argv[5]) if len(sys.argv) > 5 else 60.0

    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = np.asarray(Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')).astype(float)
    S = np.array(meta['S']); half_w, step = meta['half_w'], meta['step']
    offs = np.array([-half_w + i * step for i in range(im.shape[1])])
    roof, crowd = masks(im)
    M = len(S)
    win = 15                                                     # окно ~60 м

    print(f"{src} z{zoom}: кандидаты (окно 60 м, полоса длиннее {min_len:.0f} м, "
          f"глубже {min_depth:.0f} м, ближний край ближе {max_off:.0f} м)")
    for name, mask in (('крыша', roof), ('зрители', crowd)):
        print(f"--- признак «{name}»")
        for side, nm in ((1, 'R'), (-1, 'L')):
            sel = np.where(offs * side >= 9)[0]
            sel = sel[np.argsort(np.abs(offs[sel]))]
            o = np.abs(offs[sel])
            res = []
            for a in range(0, M, win // 2):
                idx = [(a + k) % M for k in range(win)]
                r = runs(o, mask[idx][:, sel].mean(axis=0), 0.6, min_depth)
                r = [x for x in r if x[0] < max_off]
                if r:
                    res.append([S[a], S[idx[-1]], r[0][0], r[0][1]])
            merged = []
            for s0, s1, n, f2 in res:
                if merged and s0 - merged[-1][1] <= 40 and abs(n - merged[-1][2]) < 12:
                    merged[-1] = [merged[-1][0], s1, min(merged[-1][2], n), max(merged[-1][3], f2)]
                else:
                    merged.append([s0, s1, n, f2])
            for s0, s1, n, f2 in merged:
                if s1 - s0 < min_len:
                    continue
                print(f"   {nm}  S {s0:6.0f}..{s1:6.0f} ({s1-s0:4.0f} м)  "
                      f"отступ {n:5.1f}..{f2:5.1f} м  глубина {f2-n:4.1f}")


if __name__ == '__main__':
    main()
