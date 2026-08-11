#!/usr/bin/env python3
"""Показать кусок развёртки круга с сеткой отступов и подписями S.

Строка ленты = станция трассы (шаг 4 м), столбец = отступ вбок (шаг из json).
Годится, чтобы глазами искать трибуны: они читаются как длинная светлая полоса
на постоянном отступе. Ленту делает unroll.py.

  python3 ribbon-view.py <S_от> <S_до> [пкс_на_метр] [файл] [src] [zoom]

Картинка изотропна: и вдоль трассы, и поперёк одинаковый масштаб, поэтому
прямоугольник трибуны на ней выглядит прямоугольником, а не полосой.
"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    s_from, s_to = float(sys.argv[1]), float(sys.argv[2])
    ppm = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    out = sys.argv[4] if len(sys.argv) > 4 else 'ribbon.png'
    src = sys.argv[5] if len(sys.argv) > 5 else 'esri'
    zoom = sys.argv[6] if len(sys.argv) > 6 else '19'

    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    S, half_w, step = meta['S'], meta['half_w'], meta['step']
    rows = [i for i, s in enumerate(S) if s_from <= s <= s_to]
    ds = (S[rows[-1]] - S[rows[0]]) / max(1, len(rows) - 1)      # метров на строку
    im = im.crop((0, rows[0], im.size[0], rows[-1] + 1))
    W = int(im.size[0] * step * ppm)
    H = int(im.size[1] * ds * ppm)
    im = im.resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for off in range(int(-half_w), int(half_w) + 1, 10):         # вертикали: отступ от осевой
        x = (off + half_w) * ppm
        colr = (0, 255, 255) if off == 0 else ((255, 120, 0) if abs(off) % 50 == 0 else (110, 110, 110))
        d.line([(x, 0), (x, H)], fill=colr, width=1)
        d.text((x + 2, 2), f"{off:+d}", fill=colr)
    for k, i in enumerate(rows):                                  # горизонтали: станции
        if round(S[i]) % 100 < ds:
            y = k * ds * ppm
            d.line([(0, y), (W, y)], fill=(255, 255, 0), width=1)
            d.text((3, y + 2), f"S={int(round(S[i]))}", fill=(255, 255, 0))
    im.save(os.path.join(HERE, out))
    print(f"{out}: {im.size}, S {S[rows[0]]:.0f}..{S[rows[-1]]:.0f}, {ppm} пкс/м, "
          f"лента ±{half_w} м")


if __name__ == '__main__':
    main()
