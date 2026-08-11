#!/usr/bin/env python3
"""Нарисовать выбранные прямоугольники трибун поверх снимка и посмотреть.

Тот же приём, что и с зонами вылета: сначала решение, потом картинка решения
поверх фотографии. Если прямоугольник лёг не на трибуну, это видно сразу.
Список трибун читается из stands.json. ВНИМАНИЕ: там off — СЕРЕДИНА трибуны
(так удобнее рисовать), а в разметке игры off — БЛИЖНИЙ край. Перевод: off_игры
= off_json - d/2.

  python3 map-stands.py <S0> <S1> [zoom] [src] [файл]
"""
import json, math, os, sys
from PIL import Image, ImageDraw
from tiles import deg2px, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
stands = json.load(open(os.path.join(HERE, 'stands.json')))


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def rows(s0, s1):
    S = cl['S']
    return [i for i in range(len(S)) if (s0 <= S[i] <= s1 if s0 <= s1 else (S[i] >= s0 or S[i] <= s1))]


def render(s0, s1, zoom=19, src='esri', out='stands.png'):
    P, R, S = cl['P'], cl['R'], cl['S']
    idx = rows(s0, s1)
    lats, lons = zip(*[game2deg(P[i][0], P[i][1]) for i in idx])
    pad = 80.0
    dlat, dlon = pad / 110540.0, pad / O['mlon']
    x0, y1 = deg2px(max(lats) + dlat, min(lons) - dlon, zoom)
    x1, y0 = deg2px(min(lats) - dlat, max(lons) + dlon, zoom)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y1 // 256), int(x1 // 256), int(y0 // 256)
    im = Image.new('RGB', (256 * (tx1 - tx0 + 1), 256 * (ty1 - ty0 + 1)))
    for i in range(tx0, tx1 + 1):
        for j in range(ty0, ty1 + 1):
            im.paste(Image.open(fetch(src, zoom, i, j)).convert('RGB'), (256 * (i - tx0), 256 * (j - ty0)))
    to = lambda lat, lon: tuple(a - b for a, b in zip(deg2px(lat, lon, zoom), (tx0 * 256, ty0 * 256)))
    d = ImageDraw.Draw(im)
    pt = lambda i, off: to(*game2deg(P[i][0] + R[i][0] * off, P[i][1] + R[i][1] * off))
    d.line([pt(i, 0) for i in idx], fill=(0, 255, 255), width=1)

    for st in stands:
        ii = rows(st['fromS'], st['toS'])
        if not any(i in idx for i in ii):
            continue
        sd = 1 if st['side'] == 'R' else -1
        near, far = sd * (st['off'] - st['d'] / 2), sd * (st['off'] + st['d'] / 2)
        poly = [pt(i, near) for i in ii] + [pt(i, far) for i in reversed(ii)]
        d.polygon(poly, outline=(255, 60, 60))
        d.line(poly + [poly[0]], fill=(255, 60, 60), width=2)
        d.text(pt(ii[len(ii) // 2], sd * (st['off'] + st['d'] / 2 + 6)), st['name'], fill=(255, 255, 0))
    im = im.crop((int(x0) - tx0 * 256, int(y1) - ty0 * 256, int(x1) - tx0 * 256, int(y0) - ty0 * 256))
    im.save(os.path.join(HERE, out))
    mpp = 156543.03392 * math.cos(math.radians(lats[0])) / (2 ** zoom)
    print(f"{out}: {im.size}, {mpp:.3f} м/пкс, трибун нарисовано: {len(stands)}")


if __name__ == '__main__':
    render(float(sys.argv[1]), float(sys.argv[2]),
           int(sys.argv[3]) if len(sys.argv) > 3 else 19,
           sys.argv[4] if len(sys.argv) > 4 else 'esri',
           sys.argv[5] if len(sys.argv) > 5 else 'stands.png')
