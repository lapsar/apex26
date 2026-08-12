#!/usr/bin/env python3
"""Вырезка развёртки с подписанными осями: строка = S, столбец = отступ.

Развёртка удобнее вида сверху тем, что отступ читается прямо в метрах,
но без подписей в ней легко ошибиться на десяток метров. Здесь оси подписаны.

  python3 strip-view.py <out.png> <S0> <S1> <side R|L> [off0] [off1] [src:zoom ...]
"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PPM = 9.0            # пикселей на метр
PAD_L, PAD_T = 46, 18


def crop(src, zoom, s0, s1, side, o0, o1):
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    S, half_w, step = meta['S'], meta['half_w'], meta['step']
    rows = [i for i, s in enumerate(S) if s0 <= s <= s1]
    ds = (S[rows[-1]] - S[rows[0]]) / max(1, len(rows) - 1)
    c0 = int((o0 * side + half_w) / step)
    c1 = int((o1 * side + half_w) / step)
    im = im.crop((min(c0, c1), rows[0], max(c0, c1), rows[-1] + 1))
    if side < 0:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im.resize((int(im.size[0] * step * PPM), int(im.size[1] * ds * PPM)), Image.LANCZOS), S[rows[0]], ds


def main():
    out, s0, s1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    side = 1 if sys.argv[4].upper() == 'R' else -1
    o0 = float(sys.argv[5]) if len(sys.argv) > 5 else 5.0
    o1 = float(sys.argv[6]) if len(sys.argv) > 6 else 50.0
    srcs = sys.argv[7:] or ['esri:19', 'goog:20']
    tiles = []
    for spec in srcs:
        src, zoom = spec.split(':')
        tiles.append((spec,) + crop(src, zoom, s0, s1, side, o0, o1))
    H = max(t[1].size[1] for t in tiles)
    W = PAD_L + sum(t[1].size[0] + PAD_L for t in tiles)
    sheet = Image.new('RGB', (W, H + PAD_T), (16, 16, 16))
    d = ImageDraw.Draw(sheet)
    x = PAD_L
    for spec, im, sTop, ds in tiles:
        sheet.paste(im, (x, PAD_T))
        d.text((x + 2, 3), f"{spec}  S {s0:.0f}..{s1:.0f} {'R' if side > 0 else 'L'}", fill=(255, 255, 0))
        for m in range(int(o0) // 5 * 5, int(o1) + 1, 5):
            if m < o0:
                continue
            px = x + (m - o0) * PPM
            d.line([(px, PAD_T), (px, PAD_T + H)], fill=(255, 130, 0), width=1)
            d.text((px + 2, PAD_T + 2), str(m), fill=(255, 190, 0))
        for s in range(int(s0) // 20 * 20, int(s1) + 1, 20):
            if s < sTop:
                continue
            py = PAD_T + (s - sTop) / ds * PPM * ds / ds * 0 + (s - sTop) * PPM
            if py > PAD_T + H:
                continue
            d.line([(x, py), (x + im.size[0], py)], fill=(0, 200, 255), width=1)
            d.text((x - PAD_L + 2, py - 6), str(s), fill=(120, 230, 255))
        x += im.size[0] + PAD_L
    sheet.save(os.path.join(HERE, out))
    print(f"{out}: {sheet.size}, {PPM} пкс/м")


if __name__ == '__main__':
    main()
