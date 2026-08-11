#!/usr/bin/env python3
"""Вид сверху на весь круг (или его часть) с осевой и подписями станций.

Нужен, чтобы глазами найти крупные постройки — трибуны, шатры, павильоны —
и понять, к какому участку трассы они относятся.

  python3 overview.py [zoom] [файл] [src] [поле_м] [S_от] [S_до]
"""
import json, math, os, sys
from PIL import Image, ImageDraw
from tiles import deg2px, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def render(zoom=18, out='overview.png', src='esri', pad=120.0, s_from=None, s_to=None):
    P, R, S = cl['P'], cl['R'], cl['S']
    idx = list(range(len(P)))
    if s_from is not None:
        idx = [i for i in idx if s_from <= S[i] <= s_to]
    lats, lons = zip(*[game2deg(P[i][0], P[i][1]) for i in idx])
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
    line = [to(*game2deg(P[i][0], P[i][1])) for i in idx]
    d.line(line, fill=(0, 255, 255), width=2)
    for i in idx:                                     # подписи станций каждые 200 м
        if round(S[i]) % 200 < 4:
            p = to(*game2deg(P[i][0] + R[i][0] * 12, P[i][1] + R[i][1] * 12))
            d.text(p, f"{int(round(S[i]))}", fill=(255, 255, 0))
            d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], outline=(255, 255, 0))
    im = im.crop((int(x0) - tx0 * 256, int(y1) - ty0 * 256, int(x1) - tx0 * 256, int(y0) - ty0 * 256))
    im.save(os.path.join(HERE, out))
    mpp = 156543.03392 * math.cos(math.radians(lats[0])) / (2 ** zoom)
    print(f"{out}: {im.size}, {mpp:.3f} м/пкс")


if __name__ == '__main__':
    render(int(sys.argv[1]) if len(sys.argv) > 1 else 18,
           sys.argv[2] if len(sys.argv) > 2 else 'overview.png',
           sys.argv[3] if len(sys.argv) > 3 else 'esri',
           float(sys.argv[4]) if len(sys.argv) > 4 else 120.0,
           float(sys.argv[5]) if len(sys.argv) > 5 else None,
           float(sys.argv[6]) if len(sys.argv) > 6 else None)
