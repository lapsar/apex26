#!/usr/bin/env python3
"""Две развёртки одного круга рядом: гоночная конфигурация против обычной.

Слой ESRI по острову снят в гоночный уик-энд, Google — вне уик-энда. Всё, что
есть на первом и отсутствует на втором, — временная гоночная постройка:
трибуна, шатёр, телекомплекс. Это единственный надёжный способ отличить
трибуну от парковой крыши на снимке 0.2 м/пиксель.

  python3 ribbon-diff.py <S_от> <S_до> [пкс_на_метр] [файл]
"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def slab(src, zoom, s_from, s_to, ppm):
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    S, half_w, step = meta['S'], meta['half_w'], meta['step']
    rows = [i for i, s in enumerate(S) if s_from <= s <= s_to]
    ds = (S[rows[-1]] - S[rows[0]]) / max(1, len(rows) - 1)
    im = im.crop((0, rows[0], im.size[0], rows[-1] + 1))
    im = im.resize((int(im.size[0] * step * ppm), int(im.size[1] * ds * ppm)), Image.LANCZOS)
    return im, S, rows, ds, half_w


def main():
    s_from, s_to = float(sys.argv[1]), float(sys.argv[2])
    ppm = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    out = sys.argv[4] if len(sys.argv) > 4 else 'diff.png'

    a, S, rows, ds, half_w = slab('esri', '19', s_from, s_to, ppm)
    b, _, _, _, _ = slab('goog', '20', s_from, s_to, ppm)
    gap = 14
    im = Image.new('RGB', (a.size[0] + b.size[0] + gap, a.size[1]), (0, 0, 0))
    im.paste(a, (0, 0)); im.paste(b, (a.size[0] + gap, 0))
    d = ImageDraw.Draw(im)
    for base in (0, a.size[0] + gap):
        for off in range(int(-half_w), int(half_w) + 1, 10):
            x = base + (off + half_w) * ppm
            colr = (0, 255, 255) if off == 0 else ((255, 120, 0) if abs(off) % 50 == 0 else (110, 110, 110))
            d.line([(x, 0), (x, im.size[1])], fill=colr, width=1)
            if off % 20 == 0:
                d.text((x + 2, 2), f"{off:+d}", fill=colr)
    for k, i in enumerate(rows):
        if round(S[i]) % 100 < ds:
            y = k * ds * ppm
            d.line([(0, y), (im.size[0], y)], fill=(255, 255, 0), width=1)
            d.text((3, y + 2), f"S={int(round(S[i]))}", fill=(255, 255, 0))
    d.text((6, im.size[1] - 14), "ESRI: гоночный уик-энд", fill=(255, 255, 255))
    d.text((a.size[0] + gap + 6, im.size[1] - 14), "Google: обычный день", fill=(255, 255, 255))
    im.save(os.path.join(HERE, out))
    print(f"{out}: {im.size}, S {S[rows[0]]:.0f}..{S[rows[-1]]:.0f}, {ppm} пкс/м")


if __name__ == '__main__':
    main()
