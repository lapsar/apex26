#!/usr/bin/env python3
"""Контактный лист кандидатов: по паре вырезок (ESRI и Google) на каждый.

Кандидатов даёт find-stands.py. Лист нужен, чтобы за один взгляд отделить
трибуну (ряды сидений читаются как частая полосатость вдоль трассы) от
павильона, парковки и деревьев. Каждая вырезка — кусок развёртки: по вертикали
станции, по горизонтали отступ от осевой от 8 до 90 м на своей стороне.

  python3 sheet.py <файл> <S0:S1:side> [<S0:S1:side> ...]
"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PPM = 3.0                       # пикселей на метр в вырезке
PAD = 26                        # место под подпись


def crop(src, zoom, s0, s1, side):
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    S, half_w, step = meta['S'], meta['half_w'], meta['step']
    rows = [i for i, s in enumerate(S) if s0 <= s <= s1]
    ds = (S[rows[-1]] - S[rows[0]]) / max(1, len(rows) - 1)
    c0 = int((8 * side + half_w) / step)
    c1 = int((90 * side + half_w) / step)
    box = (min(c0, c1), rows[0], max(c0, c1), rows[-1] + 1)
    im = im.crop(box)
    if side < 0:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)          # ближний край всегда слева
    return im.resize((int(im.size[0] * step * PPM), int(im.size[1] * ds * PPM)), Image.LANCZOS)


def main():
    out = sys.argv[1]
    cands = []
    for a in sys.argv[2:]:
        s0, s1, sd = a.split(':')
        cands.append((float(s0), float(s1), 1 if sd.upper() == 'R' else -1))
    cells = []
    for s0, s1, sd in cands:
        pair = [crop('esri', '19', s0, s1, sd), crop('goog', '20', s0, s1, sd)]
        h = max(p.size[1] for p in pair)
        w = sum(p.size[0] for p in pair) + 6
        cell = Image.new('RGB', (w, h + PAD), (0, 0, 0))
        x = 0
        for p in pair:
            cell.paste(p, (x, PAD)); x += p.size[0] + 6
        d = ImageDraw.Draw(cell)
        d.text((3, 2), f"S {s0:.0f}-{s1:.0f} {'R' if sd > 0 else 'L'}  ESRI | Google", fill=(255, 255, 0))
        for m in (10, 20, 30, 40, 50):                      # метки отступа на первой вырезке
            x = (m - 8) * PPM
            d.line([(x, PAD), (x, PAD + h)], fill=(255, 120, 0), width=1)
            d.text((x + 2, PAD + 2), str(m), fill=(255, 160, 0))
        cells.append(cell)
    H = max(c.size[1] for c in cells)
    W = sum(c.size[0] + 10 for c in cells)
    sheet = Image.new('RGB', (W, H), (20, 20, 20))
    x = 0
    for c in cells:
        sheet.paste(c, (x, 0)); x += c.size[0] + 10
    sheet.save(os.path.join(HERE, out))
    print(f"{out}: {sheet.size}, вырезок {len(cells)}, {PPM} пкс/м, отступ 8..90 м")


if __name__ == '__main__':
    main()
