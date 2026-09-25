#!/usr/bin/env python3
"""ПОЛОСА СНИМКА ВДОЛЬ ОСЕВОЙ ИГРЫ — «посмотреть глазами» барьер и зоны вылета.

Круг выпрямляется: по горизонтали S (едем слева направо), по вертикали отступ
от осевой (ЛЕВАЯ сторона по ходу сверху, правая снизу), оба в одном масштабе.
Сетка: жёлтые линии — кромка полотна (±half), тонкие серые — каждые 5 м отступа,
подписи S — каждые 20 м. Так барьер читается прямо в метрах от осевой, а не
«на глаз по снимку сверху».

    node dump-cl.js
    python3 strip.py 300 600                  # goog z20, ±40 м, 0.2 м/пкс
    python3 strip.py 300 600 esri 19 50       # другой снимок и ширина
    -> strip_<src>_<S0>_<S1>.png (в .gitignore)

Тайлы берутся из того же кэша, что и unroll.py (tilecache/).
"""
import json, math, os, sys
from PIL import Image, ImageDraw
import numpy as np
from unroll import Mosaic, game2deg, deg2px

HERE = os.path.dirname(os.path.abspath(__file__))
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); L = cl['len']; HALF = cl['half']


def at(s):
    s %= L
    i = int(np.searchsorted(S, s, side='right') - 1); j = (i + 1) % len(S)
    f = (s - S[i]) / (((S[j] - S[i]) % L) or 1e-9)
    p = P[i] * (1 - f) + P[j] * f; r = R[i] * (1 - f) + R[j] * f
    return p, r / np.linalg.norm(r)


def main():
    a = sys.argv[1:]
    s0, s1 = float(a[0]), float(a[1])
    src = a[2] if len(a) > 2 else 'goog'
    z = int(a[3]) if len(a) > 3 else (20 if src == 'goog' else 19)
    hw = float(a[4]) if len(a) > 4 else 40.0
    st = float(a[5]) if len(a) > 5 else 0.2
    if s1 < s0: s1 += L
    ncol = int((s1 - s0) / st) + 1; nrow = int(2 * hw / st) + 1
    mo = Mosaic(src, z)
    need = set()
    for c in range(0, ncol, 10):
        p, r = at(s0 + c * st)
        for off in (-hw, 0, hw):
            q = p + r * off
            fx, fy = deg2px(*game2deg(q[0], q[1]), z)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    need.add((int(fx // 256) + dx, int(fy // 256) + dy))
    mo.need(sorted(need))
    im = Image.new('RGB', (ncol, nrow)); px = im.load()
    for c in range(ncol):
        p, r = at(s0 + c * st)
        for k in range(nrow):
            off = -hw + k * st                     # строка 0 = левая сторона (off<0)
            q = p + r * off
            fx, fy = deg2px(*game2deg(q[0], q[1]), z)
            px[c, k] = mo.pixel(fx, fy)
    d = ImageDraw.Draw(im)
    for off in range(-int(hw), int(hw) + 1, 5):
        y = (off + hw) / st
        d.line([(0, y), (ncol, y)], fill=(90, 90, 90) if off else (200, 200, 200), width=1)
        for x in range(0, ncol, int(40 / st)):              # подписи отступа — каждые 40 м вдоль
            d.text((x + 2, y - 10), str(abs(off)), fill=(255, 255, 255))
    for off in range(-int(hw), int(hw) + 1):                # метровые засечки
        y = (off + hw) / st
        for x in range(0, ncol, int(40 / st)):
            d.line([(x, y), (x + (14 if off % 5 == 0 else 7), y)], fill=(255, 255, 255), width=1)
    for off in (-HALF, HALF):
        y = (off + hw) / st
        d.line([(0, y), (ncol, y)], fill=(255, 220, 0), width=1)
    s = math.ceil(s0 / 20) * 20
    while s <= s1:
        x = (s - s0) / st
        d.line([(x, 0), (x, 12)], fill=(255, 255, 255), width=2)
        d.text((x + 3, 1), '%d' % (s % L), fill=(255, 255, 255))
        s += 20
    out = os.path.join(HERE, 'strip_%s_%d_%d.png' % (src, s0, s1 % L if s1 > L else s1))
    im.save(out)
    print(out, im.size)


if __name__ == '__main__':
    main()
