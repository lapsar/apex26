#!/usr/bin/env python3
"""Вид сверху с ЯВНО помеченными сторонами: правая красная, левая синяя.

Нужен потому, что путать стороны здесь легко: координаты игры отражены по X,
и «слева по ходу» на снимке north-up может оказаться где угодно. Полосы
нарисованы на отступах 15 и 40 м, между ними обычно и стоит трибуна.

  python3 sides.py <S0> <S1> [zoom] [src] [файл]
"""
import json, math, os, sys
from PIL import Image, ImageDraw
from tiles import deg2px, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def render(s0, s1, zoom=19, src='esri', out='sides.png'):
    P, R, S = cl['P'], cl['R'], cl['S']
    idx = [i for i in range(len(P)) if s0 <= S[i] <= s1]
    lats, lons = zip(*[game2deg(P[i][0], P[i][1]) for i in idx])
    pad = 70.0
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

    def ribbon(off, colr, w=2):
        d.line([to(*game2deg(P[i][0] + R[i][0] * off, P[i][1] + R[i][1] * off)) for i in idx], fill=colr, width=w)

    ribbon(0, (0, 255, 255), 1)
    for off in (15, 40):
        ribbon(off, (255, 40, 40), 2)          # правая сторона — красная
        ribbon(-off, (40, 90, 255), 2)         # левая — синяя
    for i in idx:
        if round(S[i]) % 50 < 4:
            p = to(*game2deg(P[i][0] + R[i][0] * 9, P[i][1] + R[i][1] * 9))
            d.text(p, f"{int(round(S[i]))}", fill=(255, 255, 0))
    im = im.crop((int(x0) - tx0 * 256, int(y1) - ty0 * 256, int(x1) - tx0 * 256, int(y0) - ty0 * 256))
    im.save(os.path.join(HERE, out))
    mpp = 156543.03392 * math.cos(math.radians(lats[0])) / (2 ** zoom)
    print(f"{out}: {im.size}, {mpp:.3f} м/пкс, красное = ПРАВО по ходу, синее = ЛЕВО")


if __name__ == '__main__':
    render(float(sys.argv[1]), float(sys.argv[2]),
           int(sys.argv[3]) if len(sys.argv) > 3 else 19,
           sys.argv[4] if len(sys.argv) > 4 else 'esri',
           sys.argv[5] if len(sys.argv) > 5 else 'sides.png')
